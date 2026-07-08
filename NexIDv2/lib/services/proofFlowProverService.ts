import { createHash } from "crypto";
import { getAddress, isAddress } from "viem";
import { requireDatabase } from "@/lib/server/db";
import { cleanIdName } from "@/lib/server/validation";
import { upsertWalletUser } from "@/lib/services/authService";
import { normalizeAgentPublicId } from "@/lib/services/agentProfileService";

type Database = ReturnType<typeof requireDatabase>;

export type ProverCandidate = {
  id: string | null;
  proverId?: string | null;
  walletAddress: string;
  roleType?: string | null;
  poolId?: string | null;
  reputation?: number;
  stakeAmountUsdc?: number;
};

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function numberEnv(names: string[], fallback: number) {
  for (const name of names) {
    const configured = Number(process.env[name]);
    if (Number.isFinite(configured) && configured > 0) return configured;
  }
  return fallback;
}

function ratioEnv(names: string[], fallback: number) {
  for (const name of names) {
    const configured = Number(process.env[name]);
    if (Number.isFinite(configured) && configured >= 0 && configured <= 1) return configured;
  }
  return fallback;
}

function numberEnvAllowZero(names: string[], fallback: number) {
  for (const name of names) {
    const configured = Number(process.env[name]);
    if (Number.isFinite(configured) && configured >= 0) return configured;
  }
  return fallback;
}

function boolEnv(names: string[], fallback = false) {
  for (const name of names) {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value) continue;
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
  }
  return fallback;
}

export function proofFlowProverPanelSize() {
  return Math.floor(numberEnv(["PROOFFLOW_PROVER_PANEL_SIZE", "PROOFFLOW_REVIEW_PANEL_SIZE"], 5));
}

export function proofFlowProverConsensusCount() {
  return Math.floor(numberEnv(["PROOFFLOW_PROVER_CONSENSUS_COUNT", "PROOFFLOW_REVIEW_CONSENSUS_COUNT"], 4));
}

export function proversPoolBaseSettlementRewardUsdc() {
  return numberEnv(["PROVERS_POOL_BASE_SETTLEMENT_REWARD_USDC", "PROOFFLOW_REVIEWER_REWARD_POOL_USDC"], 50);
}

export function proofFlowAgentProverWeeklyCap() {
  return Math.floor(numberEnvAllowZero(["PROOFFLOW_AGENT_PROVER_WEEKLY_CAP", "PROOFFLOW_AGENT_PROVER_REGISTRATION_CAP"], 20));
}

export function proofFlowAgentProverStakeUsdc() {
  return numberEnv(["PROOFFLOW_AGENT_PROVER_STAKE_USDC"], 125);
}

export function proofFlowAgentProverSlashBps() {
  return Math.floor(numberEnvAllowZero(["PROOFFLOW_AGENT_PROVER_SLASH_BPS"], 1000));
}

export function defaultProofFlowProverPoolId() {
  return process.env.PROOFFLOW_ACTIVE_PROVER_POOL_ID?.trim() || "default";
}

export function proofFlowActiveProverRoleTypes() {
  const raw = process.env.PROOFFLOW_ACTIVE_PROVER_ROLE_TYPES?.trim();
  if (!raw) return null;
  const values = raw.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  return values.length ? values : null;
}

export function proverRewardAllocationRules() {
  const alignedShare = ratioEnv(["PROVERS_POOL_ALIGNED_SHARE"], 0.8);
  const topNoteBonusShare = ratioEnv(["PROVERS_POOL_TOP_NOTE_BONUS_SHARE"], Math.max(0, 1 - alignedShare));
  const total = alignedShare + topNoteBonusShare;
  if (total <= 1) return { alignedShare, topNoteBonusShare };
  return {
    alignedShare: alignedShare / total,
    topNoteBonusShare: topNoteBonusShare / total
  };
}

export function proversPoolFundingSources() {
  const raw = process.env.PROVERS_POOL_FUNDING_SOURCES ?? "GENESIS_FUNDING,FORFEITED_DISPUTE_BONDS,SETTLEMENT_FEES,GOVERNANCE_APPROVED";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function configuredGenesisProverWallets() {
  const raw = (
    process.env.PROOFFLOW_GENESIS_PROVER_WALLETS?.trim()
    || process.env.PROOFFLOW_REVIEWER_WALLETS?.trim()
    || process.env.NATIVE_GENESIS_PROVER_ADDRESSES?.trim()
    || ""
  );
  const seen = new Set<string>();
  const wallets: string[] = [];
  for (const item of raw.split(",")) {
    const value = item.trim();
    if (!isAddress(value)) continue;
    const checksum = getAddress(value);
    const key = checksum.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    wallets.push(checksum);
  }
  return wallets;
}

export function normalizeProverWallet(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || !isAddress(trimmed)) return null;
  return getAddress(trimmed);
}

function weekStartUtc(date = new Date()) {
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday));
}

function normalizedSet(values: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const value of values) {
    const wallet = normalizeProverWallet(value);
    if (wallet) set.add(wallet.toLowerCase());
  }
  return set;
}

function deterministicScore(seed: string, walletAddress: string) {
  return createHash("sha256").update(`${seed}:${walletAddress.toLowerCase()}`).digest("hex");
}

function deterministicSelect(candidates: ProverCandidate[], count: number, seed: string) {
  return [...candidates]
    .sort((left, right) => {
      const score = deterministicScore(seed, left.walletAddress).localeCompare(deterministicScore(seed, right.walletAddress));
      if (score !== 0) return score;
      return left.walletAddress.toLowerCase().localeCompare(right.walletAddress.toLowerCase());
    })
    .slice(0, count);
}

async function userForWallet(db: Database, walletAddress: string) {
  return db.user.findFirst({
    where: { walletAddress: { equals: walletAddress, mode: "insensitive" } },
    select: { id: true, displayName: true, primaryIdName: true }
  });
}

async function activeIdNameForWallet(db: Database, walletAddress: string, requested?: string | null) {
  const normalizedRequested = cleanIdName(String(requested ?? ""));
  const user = await db.user.findFirst({
    where: { walletAddress: { equals: walletAddress, mode: "insensitive" } },
    select: { id: true, displayName: true, primaryIdName: true }
  });
  if (!user) return null;
  const where = normalizedRequested
    ? { userId: user.id, name: normalizedRequested, status: "active" as const }
    : { userId: user.id, status: "active" as const };
  const idName = await db.idName.findFirst({
    where,
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
  });
  return idName ? { ...idName, user } : null;
}

async function ensureAgentProfileForProver(db: Database, input: {
  walletAddress: string;
  agentProfileId?: string | null;
  idName: string;
  displayName?: string | null;
}) {
  const existingById = input.agentProfileId
    ? await db.agentProfile.findUnique({ where: { id: input.agentProfileId } })
    : null;
  if (existingById) {
    if (existingById.ownerWallet && existingById.ownerWallet.toLowerCase() !== input.walletAddress.toLowerCase()) {
      throw new Error("Agent profile is owned by a different wallet.");
    }
    return db.agentProfile.update({
      where: { id: existingById.id },
      data: {
        ownerWallet: existingById.ownerWallet ?? input.walletAddress,
        publicId: existingById.publicId ?? input.idName,
        displayName: existingById.displayName || input.displayName || `${input.idName}.id`
      }
    });
  }
  const existingByWallet = await db.agentProfile.findFirst({
    where: { ownerWallet: { equals: input.walletAddress, mode: "insensitive" } },
    orderBy: { createdAt: "asc" }
  });
  if (existingByWallet) {
    return db.agentProfile.update({
      where: { id: existingByWallet.id },
      data: {
        publicId: existingByWallet.publicId ?? input.idName,
        displayName: existingByWallet.displayName || input.displayName || `${input.idName}.id`
      }
    });
  }
  const user = await upsertWalletUser({
    walletAddress: input.walletAddress,
    displayName: input.displayName ?? `${input.idName}.id`,
    primaryDomainName: `${input.idName}.id`
  });
  return db.agentProfile.create({
    data: {
      publicId: input.idName,
      displayName: input.displayName ?? `${input.idName}.id`,
      ownerUserId: user.id,
      ownerWallet: input.walletAddress
    }
  });
}

export async function getAgentProverRegistrationPolicy(db: Database) {
  const defaults = {
    agentRegistrationsPaused: boolEnv(["PROOFFLOW_AGENT_PROVER_REGISTRATIONS_PAUSED"], false),
    weeklyAgentRegistrationCap: proofFlowAgentProverWeeklyCap(),
    agentStakeUsdc: proofFlowAgentProverStakeUsdc(),
    agentSlashBps: proofFlowAgentProverSlashBps(),
    poolId: defaultProofFlowProverPoolId()
  };
  return db.proofFlowProverRegistrationPolicy.upsert({
    where: { policyKey: "agent_prover_v1" },
    update: {},
    create: {
      policyKey: "agent_prover_v1",
      ...defaults,
      metadata: jsonInput({ source: "defaults" })
    }
  });
}

export async function updateAgentProverRegistrationPolicy(
  db: Database,
  input: {
    agentRegistrationsPaused?: boolean;
    weeklyAgentRegistrationCap?: number;
    agentStakeUsdc?: number;
    agentSlashBps?: number;
    poolId?: string;
    updatedByWallet?: string | null;
    metadata?: unknown;
  }
) {
  const current = await getAgentProverRegistrationPolicy(db);
  const updated = await db.proofFlowProverRegistrationPolicy.update({
    where: { id: current.id },
    data: {
      agentRegistrationsPaused: input.agentRegistrationsPaused ?? current.agentRegistrationsPaused,
      weeklyAgentRegistrationCap: input.weeklyAgentRegistrationCap ?? current.weeklyAgentRegistrationCap,
      agentStakeUsdc: input.agentStakeUsdc ?? current.agentStakeUsdc,
      agentSlashBps: input.agentSlashBps ?? current.agentSlashBps,
      poolId: input.poolId ?? current.poolId,
      updatedByWallet: input.updatedByWallet ?? undefined,
      metadata: input.metadata === undefined ? current.metadata as never : jsonInput(input.metadata)
    }
  });
  await recordProverPoolLedger(db, {
    sourceType: "AGENT_PROVER_POLICY",
    entryType: "AGENT_PROVER_POLICY_UPDATED",
    status: "RECORDED",
    metadata: {
      policyKey: updated.policyKey,
      agentRegistrationsPaused: updated.agentRegistrationsPaused,
      weeklyAgentRegistrationCap: updated.weeklyAgentRegistrationCap,
      agentStakeUsdc: updated.agentStakeUsdc,
      agentSlashBps: updated.agentSlashBps,
      poolId: updated.poolId,
      updatedByWallet: input.updatedByWallet ?? null
    }
  });
  return updated;
}

export async function registerAgentProver(input: {
  walletAddress: string;
  idName?: string | null;
  displayName?: string | null;
  agentProfileId?: string | null;
  stakeAmountUsdc?: number | null;
  stakeTxHash?: string | null;
  poolId?: string | null;
}) {
  const db = requireDatabase();
  const walletAddress = normalizeProverWallet(input.walletAddress);
  if (!walletAddress) throw new Error("Agent Prover registration requires a valid wallet address.");
  const existing = await db.proofFlowProver.findUnique({ where: { walletAddress } });
  const policy = await getAgentProverRegistrationPolicy(db);
  const stakeAmountUsdc = Number(input.stakeAmountUsdc ?? policy.agentStakeUsdc);
  if (stakeAmountUsdc < policy.agentStakeUsdc) {
    throw new Error(`Agent Prover stake must be at least ${policy.agentStakeUsdc} USDC.`);
  }
  if (!input.stakeTxHash?.trim() && !existing) {
    throw new Error("Agent Prover registration requires a stake transaction hash.");
  }
  const weekStart = weekStartUtc();
  if (!existing) {
    if (policy.agentRegistrationsPaused) {
      await recordProverPoolLedger(db, {
        proverWallet: walletAddress,
        sourceType: "AGENT_PROVER_REGISTRATION",
        entryType: "AGENT_PROVER_REGISTRATION_BLOCKED",
        status: "BLOCKED",
        metadata: { reason: "kill_switch", policyKey: policy.policyKey }
      });
      throw new Error("Agent Prover registrations are paused.");
    }
    const registeredThisWeek = await db.proofFlowProver.count({
      where: {
        roleType: "AGENT",
        registrationWeekStart: weekStart
      }
    });
    if (registeredThisWeek >= policy.weeklyAgentRegistrationCap) {
      await recordProverPoolLedger(db, {
        proverWallet: walletAddress,
        sourceType: "AGENT_PROVER_REGISTRATION",
        entryType: "AGENT_PROVER_REGISTRATION_BLOCKED",
        status: "BLOCKED",
        metadata: {
          reason: "weekly_cap",
          cap: policy.weeklyAgentRegistrationCap,
          registeredThisWeek,
          weekStart: weekStart.toISOString()
        }
      });
      throw new Error("Weekly Agent Prover registration cap reached.");
    }
  }
  const activeId = await activeIdNameForWallet(db, walletAddress, input.idName);
  if (!activeId) throw new Error("Agent Prover registration requires an active .id for the registering wallet.");
  const publicId = normalizeAgentPublicId(activeId.name);
  const profile = await ensureAgentProfileForProver(db, {
    walletAddress,
    agentProfileId: input.agentProfileId,
    idName: publicId,
    displayName: input.displayName ?? activeId.user.displayName ?? `${publicId}.id`
  });
  const poolId = input.poolId?.trim() || policy.poolId || defaultProofFlowProverPoolId();
  const row = existing
    ? await db.proofFlowProver.update({
      where: { walletAddress },
      data: {
        userId: activeId.userId ?? undefined,
        agentProfileId: profile.id,
        idName: publicId,
        displayName: input.displayName ?? profile.displayName,
        roleType: "AGENT",
        poolId,
        genesisStatus: "AGENT",
        onboardingType: "AGENT_PROVER",
        status: "ACTIVE",
        genesisBadge: false,
        stakeAmountUsdc,
        stakeStatus: "STAKED",
        stakeTxHash: input.stakeTxHash ?? existing.stakeTxHash,
        stakedAt: existing.stakedAt ?? new Date(),
        registrationWeekStart: existing.registrationWeekStart ?? weekStart,
        metadata: jsonInput({
          policyKey: policy.policyKey,
          agentStakeUsdc: policy.agentStakeUsdc,
          registeredVia: "agent_prover_registration"
        })
      }
    })
    : await db.proofFlowProver.create({
      data: {
        walletAddress,
        userId: activeId.userId ?? undefined,
        agentProfileId: profile.id,
        idName: publicId,
        displayName: input.displayName ?? profile.displayName,
        publicProfileSlug: publicId || walletAddress.toLowerCase(),
        roleType: "AGENT",
        poolId,
        genesisStatus: "AGENT",
        onboardingType: "AGENT_PROVER",
        status: "ACTIVE",
        genesisBadge: false,
        stakeAmountUsdc,
        stakeStatus: "STAKED",
        stakeTxHash: input.stakeTxHash ?? undefined,
        stakedAt: new Date(),
        registeredAt: new Date(),
        registrationWeekStart: weekStart,
        metadata: jsonInput({
          policyKey: policy.policyKey,
          agentStakeUsdc: policy.agentStakeUsdc,
          registeredVia: "agent_prover_registration"
        })
      }
    });
  await recordProverPoolLedger(db, {
    proverWallet: walletAddress,
    sourceType: "AGENT_PROVER_REGISTRATION",
    entryType: existing ? "AGENT_PROVER_REGISTRATION_UPDATED" : "AGENT_PROVER_REGISTERED",
    amountUsdc: stakeAmountUsdc,
    status: "RECORDED",
    txHash: input.stakeTxHash ?? existing?.stakeTxHash ?? null,
    metadata: {
      proverId: row.id,
      agentProfileId: profile.id,
      idName: publicId,
      poolId,
      roleType: "AGENT",
      weekStart: weekStart.toISOString()
    }
  });
  await recordProverPoolLedger(db, {
    proverWallet: walletAddress,
    sourceType: "AGENT_PROVER_STAKE",
    entryType: "AGENT_PROVER_STAKE_RECORDED",
    amountUsdc: stakeAmountUsdc,
    status: "RECORDED",
    txHash: input.stakeTxHash ?? existing?.stakeTxHash ?? null,
    metadata: {
      proverId: row.id,
      stakeStatus: "STAKED",
      slashBps: policy.agentSlashBps
    }
  });
  return row;
}

export async function syncGenesisProversFromConfig(db: Database) {
  const wallets = configuredGenesisProverWallets();
  const rows = [];
  for (const walletAddress of wallets) {
    const user = await userForWallet(db, walletAddress);
    rows.push(await db.proofFlowProver.upsert({
      where: { walletAddress },
      create: {
        walletAddress,
        userId: user?.id,
        idName: user?.primaryIdName ?? undefined,
        displayName: user?.displayName ?? user?.primaryIdName ?? "Genesis Prover",
        publicProfileSlug: walletAddress.toLowerCase(),
        roleType: "HUMAN",
        poolId: defaultProofFlowProverPoolId(),
        genesisStatus: "GENESIS",
        onboardingType: "GENESIS_MANUAL",
        status: "ACTIVE",
        genesisBadge: true,
        stakeStatus: "NOT_REQUIRED",
        registrationWeekStart: weekStartUtc(),
        metadata: jsonInput({ source: "env_config" })
      },
      update: {
        userId: user?.id ?? undefined,
        idName: user?.primaryIdName ?? undefined,
        displayName: user?.displayName ?? user?.primaryIdName ?? undefined,
        roleType: "HUMAN",
        poolId: defaultProofFlowProverPoolId(),
        genesisStatus: "GENESIS",
        onboardingType: "GENESIS_MANUAL",
        status: "ACTIVE",
        genesisBadge: true,
        stakeStatus: "NOT_REQUIRED"
      }
    }));
  }
  return rows;
}

export async function proofFlowExcludedProverWallets(
  db: Database,
  input: {
    marketId: string;
    resolutionId?: string | null;
    excludedWallets?: Array<string | null | undefined>;
  }
) {
  const [market, resolutions, evidence, positions, disputes] = await Promise.all([
    db.market.findUnique({ where: { id: input.marketId }, select: { creatorWallet: true } }),
    db.marketResolution.findMany({
      where: {
        marketId: input.marketId,
        ...(input.resolutionId ? { id: input.resolutionId } : {})
      },
      select: { proposerWallet: true }
    }),
    db.proofFlowEvidenceSubmission.findMany({
      where: { marketId: input.marketId },
      select: { walletAddress: true }
    }),
    db.nativePosition.findMany({
      where: { marketId: input.marketId },
      select: { walletAddress: true }
    }),
    db.marketDispute.findMany({
      where: { marketId: input.marketId },
      select: { disputerWallet: true }
    })
  ]);

  return normalizedSet([
    market?.creatorWallet,
    ...resolutions.map((item) => item.proposerWallet),
    ...evidence.map((item) => item.walletAddress),
    ...positions.map((item) => item.walletAddress),
    ...disputes.map((item) => item.disputerWallet),
    ...(input.excludedWallets ?? [])
  ]);
}

export async function eligibleGenesisProverCandidates(
  db: Database,
  input: {
    marketId: string;
    resolutionId?: string | null;
    excludedWallets?: Array<string | null | undefined>;
  }
) {
  await syncGenesisProversFromConfig(db);
  const excluded = await proofFlowExcludedProverWallets(db, input);
  const configured = configuredGenesisProverWallets();
  const configuredSet = normalizedSet(configured);
  const rows = await db.proofFlowProver.findMany({
    where: {
      status: "ACTIVE",
      genesisStatus: "GENESIS",
      ...(configured.length ? { walletAddress: { in: configured } } : {})
    },
    select: { userId: true, walletAddress: true }
  });
  const seen = new Set<string>();
  const candidates: ProverCandidate[] = [];
  for (const row of rows) {
    const wallet = normalizeProverWallet(row.walletAddress);
    if (!wallet) continue;
    const key = wallet.toLowerCase();
    if (seen.has(key) || excluded.has(key)) continue;
    if (configured.length && !configuredSet.has(key)) continue;
    seen.add(key);
    candidates.push({ id: row.userId ?? null, walletAddress: wallet });
  }
  return candidates;
}

export async function eligibleProverCandidates(
  db: Database,
  input: {
    marketId: string;
    resolutionId?: string | null;
    excludedWallets?: Array<string | null | undefined>;
    poolId?: string | null;
    roleTypes?: string[] | null;
  }
) {
  await syncGenesisProversFromConfig(db);
  const excluded = await proofFlowExcludedProverWallets(db, input);
  const poolId = input.poolId?.trim() || defaultProofFlowProverPoolId();
  const roleTypes = input.roleTypes?.length ? input.roleTypes.map((item) => item.toUpperCase()) : proofFlowActiveProverRoleTypes();
  const rows = await db.proofFlowProver.findMany({
    where: {
      status: "ACTIVE",
      poolId,
      ...(roleTypes?.length ? { roleType: { in: roleTypes } } : {})
    },
    select: {
      id: true,
      userId: true,
      walletAddress: true,
      roleType: true,
      poolId: true,
      reputation: true,
      stakeAmountUsdc: true,
      stakeStatus: true
    }
  });
  const seen = new Set<string>();
  const candidates: ProverCandidate[] = [];
  for (const row of rows) {
    const wallet = normalizeProverWallet(row.walletAddress);
    if (!wallet) continue;
    const key = wallet.toLowerCase();
    if (seen.has(key) || excluded.has(key)) continue;
    if (row.roleType === "AGENT" && row.stakeStatus !== "STAKED") continue;
    seen.add(key);
    candidates.push({
      id: row.userId ?? null,
      proverId: row.id,
      walletAddress: wallet,
      roleType: row.roleType,
      poolId: row.poolId,
      reputation: row.reputation,
      stakeAmountUsdc: row.stakeAmountUsdc
    });
  }
  return candidates;
}

export async function selectProverPanelFromPool(
  db: Database,
  input: {
    marketId: string;
    resolutionId?: string | null;
    round: number;
    excludedWallets?: Array<string | null | undefined>;
    poolId?: string | null;
    roleTypes?: string[] | null;
  }
) {
  const poolId = input.poolId?.trim() || defaultProofFlowProverPoolId();
  const roleTypes = input.roleTypes?.length ? input.roleTypes.map((item) => item.toUpperCase()) : proofFlowActiveProverRoleTypes();
  const candidates = await eligibleProverCandidates(db, { ...input, poolId, roleTypes });
  const panelSize = proofFlowProverPanelSize();
  if (candidates.length < panelSize) {
    throw new Error(`ProofFlow needs ${panelSize} eligible Provers in pool ${poolId} before opening Evidence Review.`);
  }
  const seed = [
    "proof-flow-prover-pool-panel",
    poolId,
    roleTypes?.join(",") ?? "all_roles",
    input.marketId,
    input.resolutionId ?? "latest",
    input.round
  ].join(":");
  return {
    candidates,
    selected: deterministicSelect(candidates, panelSize, seed),
    seed,
    poolId,
    roleTypes
  };
}

export async function selectGenesisProverPanel(
  db: Database,
  input: {
    marketId: string;
    resolutionId?: string | null;
    round: number;
    excludedWallets?: Array<string | null | undefined>;
  }
) {
  return selectProverPanelFromPool(db, input);
}

export function reputationWeightForProver(reputation?: number | null) {
  return Math.max(0, Number(reputation ?? 0));
}

export async function reputationWeightsForAssignments(
  db: Database,
  assignments: Array<{ reviewerWallet: string }>
) {
  const wallets = assignments.map((assignment) => normalizeProverWallet(assignment.reviewerWallet)).filter(Boolean) as string[];
  const rows = wallets.length
    ? await db.proofFlowProver.findMany({
      where: { walletAddress: { in: wallets } },
      select: { walletAddress: true, reputation: true }
    })
    : [];
  const map = new Map(rows.map((row) => [row.walletAddress.toLowerCase(), reputationWeightForProver(row.reputation)]));
  return assignments.map((assignment) => map.get(assignment.reviewerWallet.toLowerCase()) ?? 0);
}

export async function applyFinalProverSlashing(
  db: Database,
  input: {
    marketId: string;
    panelId?: string | null;
    finalOutcome: string;
  }
) {
  const policy = await getAgentProverRegistrationPolicy(db);
  const panels = await db.proofFlowReviewPanel.findMany({
    where: {
      marketId: input.marketId,
      ...(input.panelId ? { id: input.panelId } : {})
    },
    include: { assignments: true }
  });
  let slashed = 0;
  for (const panel of panels) {
    const accurate = panel.assignments.filter((assignment) => assignment.status === "revealed" && assignment.recommendedOutcome === input.finalOutcome);
    const wrong = panel.assignments.filter((assignment) => assignment.status === "revealed" && assignment.recommendedOutcome && assignment.recommendedOutcome !== input.finalOutcome);
    const accurateWallets = accurate.map((assignment) => assignment.reviewerWallet);
    for (const assignment of wrong) {
      const existing = await db.proversPoolLedger.findFirst({
        where: {
          marketId: input.marketId,
          panelId: panel.id,
          assignmentId: assignment.id,
          entryType: "STAKE_SLASHED"
        }
      });
      if (existing) continue;
      const prover = await db.proofFlowProver.findUnique({ where: { walletAddress: assignment.reviewerWallet } });
      if (!prover || prover.stakeAmountUsdc <= 0 || prover.stakeStatus !== "STAKED") continue;
      const slashAmount = Math.min(prover.stakeAmountUsdc, (prover.stakeAmountUsdc * policy.agentSlashBps) / 10000);
      if (slashAmount <= 0) continue;
      await db.proofFlowProver.update({
        where: { id: prover.id },
        data: {
          stakeAmountUsdc: Math.max(0, prover.stakeAmountUsdc - slashAmount),
          stakeSlashedUsdc: prover.stakeSlashedUsdc + slashAmount,
          stakeStatus: prover.stakeAmountUsdc - slashAmount > 0 ? "STAKED" : "SLASHED"
        }
      });
      await recordProverPoolLedger(db, {
        marketId: input.marketId,
        resolutionId: assignment.resolutionId,
        panelId: panel.id,
        assignmentId: assignment.id,
        proverWallet: assignment.reviewerWallet,
        sourceType: "PROVER_STAKE",
        entryType: "STAKE_SLASHED",
        amountUsdc: slashAmount,
        status: "CONFIRMED",
        metadata: {
          finalOutcome: input.finalOutcome,
          submittedOutcome: assignment.recommendedOutcome,
          slashBps: policy.agentSlashBps,
          accurateWallets
        }
      });
      slashed += slashAmount;
      const recipientShare = accurate.length > 0 ? slashAmount / accurate.length : 0;
      for (const recipient of accurate) {
        await recordProverPoolLedger(db, {
          marketId: input.marketId,
          resolutionId: recipient.resolutionId,
          panelId: panel.id,
          assignmentId: recipient.id,
          proverWallet: recipient.reviewerWallet,
          sourceType: "PROVER_STAKE",
          entryType: "SLASH_DISTRIBUTION",
          amountUsdc: recipientShare,
          status: "CONFIRMED",
          metadata: {
            slashedAssignmentId: assignment.id,
            slashedWallet: assignment.reviewerWallet,
            finalOutcome: input.finalOutcome
          }
        });
      }
    }
  }
  return slashed;
}

export async function recordProverPoolLedger(
  db: Database,
  input: {
    marketId?: string | null;
    resolutionId?: string | null;
    panelId?: string | null;
    assignmentId?: string | null;
    proverWallet?: string | null;
    sourceType: string;
    entryType: string;
    amountUsdc?: number | null;
    status?: string | null;
    txHash?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  return db.proversPoolLedger.create({
    data: {
      marketId: input.marketId ?? undefined,
      resolutionId: input.resolutionId ?? undefined,
      panelId: input.panelId ?? undefined,
      assignmentId: input.assignmentId ?? undefined,
      proverWallet: input.proverWallet ?? undefined,
      sourceType: input.sourceType,
      entryType: input.entryType,
      amountUsdc: Number(input.amountUsdc ?? 0),
      status: input.status ?? "RECORDED",
      txHash: input.txHash ?? undefined,
      metadata: jsonInput(input.metadata ?? null)
    }
  });
}

export async function syncProverStatsForMarket(db: Database, marketId: string) {
  const assignments = await db.proofFlowReviewAssignment.findMany({
    where: { marketId },
    include: { panel: true }
  });
  const grouped = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const wallet = normalizeProverWallet(assignment.reviewerWallet);
    if (!wallet) continue;
    grouped.set(wallet, [...(grouped.get(wallet) ?? []), assignment]);
  }
  for (const [walletAddress, rows] of grouped.entries()) {
    const completedRows = rows.filter((assignment) => ["revealed", "missed_reveal", "finalized"].includes(assignment.status));
    const successfulRows = rows.filter((assignment) => (
      assignment.status === "revealed"
      && assignment.recommendedOutcome
      && assignment.panel.consensusOutcome === assignment.recommendedOutcome
    ));
    const [ledger, allAssignments] = await Promise.all([
      db.proofFlowReviewerReputationLedger.aggregate({
        where: { reviewerWallet: { equals: walletAddress, mode: "insensitive" }, status: "CONFIRMED" },
        _sum: { delta: true }
      }),
      db.proofFlowReviewAssignment.findMany({
        where: { reviewerWallet: { equals: walletAddress, mode: "insensitive" } },
        include: { panel: true }
      })
    ]);
    const totalAssignments = allAssignments.length;
    const successfulSettlements = allAssignments.filter((assignment) => (
      assignment.status === "revealed"
      && assignment.recommendedOutcome
      && assignment.panel.consensusOutcome === assignment.recommendedOutcome
    )).length;
    const completedSettlements = allAssignments.filter((assignment) => ["revealed", "missed_reveal", "finalized"].includes(assignment.status)).length;
    const accuracy = completedSettlements > 0 ? Math.round((successfulSettlements / completedSettlements) * 10000) / 100 : 0;
    await db.proofFlowProver.upsert({
      where: { walletAddress },
      create: {
        walletAddress,
        publicProfileSlug: walletAddress.toLowerCase(),
        genesisStatus: "GENESIS",
        onboardingType: "GENESIS_MANUAL",
        status: "ACTIVE",
        genesisBadge: true,
        reputation: Number(ledger._sum.delta ?? 0),
        accuracy,
        completedSettlements,
        totalAssignments,
        successfulSettlements,
        metadata: jsonInput({
          lastSyncedMarketId: marketId,
          completedInMarket: completedRows.length,
          successfulInMarket: successfulRows.length
        })
      },
      update: {
        reputation: Number(ledger._sum.delta ?? 0),
        accuracy,
        completedSettlements,
        totalAssignments,
        successfulSettlements,
        metadata: jsonInput({
          lastSyncedMarketId: marketId,
          completedInMarket: completedRows.length,
          successfulInMarket: successfulRows.length
        })
      }
    });
  }
}

export async function getPublicProverProfile(identifier: string) {
  const db = requireDatabase();
  const wallet = normalizeProverWallet(identifier);
  const prover = wallet
    ? await db.proofFlowProver.findUnique({
      where: { walletAddress: wallet },
      include: { user: { select: { primaryIdName: true, displayName: true } } }
    })
    : await db.proofFlowProver.findUnique({
      where: { publicProfileSlug: identifier.trim().toLowerCase() },
      include: { user: { select: { primaryIdName: true, displayName: true } } }
    });
  if (!prover) return null;
  return {
    id: prover.id,
    walletAddress: prover.walletAddress,
    agentProfileId: prover.agentProfileId,
    idName: prover.idName ?? prover.user?.primaryIdName ?? null,
    displayName: prover.displayName ?? prover.user?.displayName ?? prover.idName ?? "ProofFlow Prover",
    publicBio: prover.publicBio,
    avatarUrl: prover.avatarUrl,
    roleType: prover.roleType,
    poolId: prover.poolId,
    genesisStatus: prover.genesisStatus,
    onboardingType: prover.onboardingType,
    status: prover.status,
    genesisBadge: prover.genesisBadge,
    stakeAmountUsdc: prover.stakeAmountUsdc,
    stakeStatus: prover.stakeStatus,
    stakeSlashedUsdc: prover.stakeSlashedUsdc,
    registeredAt: prover.registeredAt,
    registrationWeekStart: prover.registrationWeekStart,
    reputation: prover.reputation,
    accuracy: prover.accuracy,
    completedSettlements: prover.completedSettlements,
    totalAssignments: prover.totalAssignments,
    successfulSettlements: prover.successfulSettlements,
    createdAt: prover.createdAt
  };
}
