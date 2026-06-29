import { createHash } from "crypto";
import { getAddress, isAddress } from "viem";
import { requireDatabase } from "@/lib/server/db";

type Database = ReturnType<typeof requireDatabase>;

export type ProverCandidate = {
  id: string | null;
  walletAddress: string;
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

export function proofFlowProverPanelSize() {
  return Math.floor(numberEnv(["PROOFFLOW_PROVER_PANEL_SIZE", "PROOFFLOW_REVIEW_PANEL_SIZE"], 5));
}

export function proofFlowProverConsensusCount() {
  return Math.floor(numberEnv(["PROOFFLOW_PROVER_CONSENSUS_COUNT", "PROOFFLOW_REVIEW_CONSENSUS_COUNT"], 4));
}

export function proversPoolBaseSettlementRewardUsdc() {
  return numberEnv(["PROVERS_POOL_BASE_SETTLEMENT_REWARD_USDC", "PROOFFLOW_REVIEWER_REWARD_POOL_USDC"], 50);
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
        genesisStatus: "GENESIS",
        onboardingType: "GENESIS_MANUAL",
        status: "ACTIVE",
        genesisBadge: true,
        metadata: jsonInput({ source: "env_config" })
      },
      update: {
        userId: user?.id ?? undefined,
        idName: user?.primaryIdName ?? undefined,
        displayName: user?.displayName ?? user?.primaryIdName ?? undefined,
        genesisStatus: "GENESIS",
        onboardingType: "GENESIS_MANUAL",
        status: "ACTIVE",
        genesisBadge: true
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

export async function selectGenesisProverPanel(
  db: Database,
  input: {
    marketId: string;
    resolutionId?: string | null;
    round: number;
    excludedWallets?: Array<string | null | undefined>;
  }
) {
  const candidates = await eligibleGenesisProverCandidates(db, input);
  const panelSize = proofFlowProverPanelSize();
  if (candidates.length < panelSize) {
    throw new Error(`ProofFlow Genesis needs ${panelSize} eligible Genesis Provers before opening Evidence Review. Configure PROOFFLOW_GENESIS_PROVER_WALLETS, PROOFFLOW_REVIEWER_WALLETS, or NATIVE_GENESIS_PROVER_ADDRESSES with the fixed prover panel wallets.`);
  }
  const seed = [
    "proof-flow-genesis-panel",
    input.marketId,
    input.resolutionId ?? "latest",
    input.round
  ].join(":");
  return {
    candidates,
    selected: deterministicSelect(candidates, panelSize, seed),
    seed
  };
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
    idName: prover.idName ?? prover.user?.primaryIdName ?? null,
    displayName: prover.displayName ?? prover.user?.displayName ?? prover.idName ?? "ProofFlow Prover",
    publicBio: prover.publicBio,
    avatarUrl: prover.avatarUrl,
    genesisStatus: prover.genesisStatus,
    onboardingType: prover.onboardingType,
    status: prover.status,
    genesisBadge: prover.genesisBadge,
    reputation: prover.reputation,
    accuracy: prover.accuracy,
    completedSettlements: prover.completedSettlements,
    totalAssignments: prover.totalAssignments,
    successfulSettlements: prover.successfulSettlements,
    createdAt: prover.createdAt
  };
}
