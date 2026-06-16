import { createHash } from "crypto";
import { keccak256, stringToBytes } from "viem";
import { nexMarketsContracts } from "@/config/nexmarkets-contracts";
import { cleanIdName } from "@/lib/server/validation";
import { requireDatabase, withDatabase } from "@/lib/server/db";
import { upsertWalletUser } from "@/lib/services/authService";
import { normalizeAgentScopes, recordAgentAudit, type AuthenticatedAgent } from "@/lib/services/bankr/agentAuthService";
import {
  agentIdLabel as profileAgentIdLabel,
  calculateAgentReputation,
  ensureAgentProfileForAgent,
  getAgentProfileByIdOrPublicId,
  getPublicAgentSummary,
  launchPolicyForReputation,
  listOwnedAgentProfiles,
  loadAgentProfileForAgent,
  normalizeAgentPublicId as normalizeProfilePublicId,
  recordAgentReputationEvent,
  serializeAgentProfileRecord,
  serializeLegacyAgentProfile,
  updateOwnedAgentProfileControls
} from "@/lib/services/agentProfileService";
import { mintIdName, prepareIdMint } from "@/lib/services/idService";
import { composeNexMindMarketDraft } from "@/lib/services/nexmind/nexmindDraftService";
import { routeCheckNexMindMarket } from "@/lib/services/nexmind/nexmindRoutingService";
import { createNativeMarketRecord, getMarketDraft, metadataHashForDraft, rulesHashForDraft, saveMarketDraft, updateMarketDraftShape } from "@/lib/services/nexmarketsService";
import { qualifyMarketDraftForLaunch, sourceQualificationBlocksLaunch } from "@/lib/services/sourceQualificationService";
import { signNativeLaunchAuthorization } from "@/lib/services/nativeLaunchAuthorizationService";
import type { AuthUser } from "@/lib/types/nexid";
import type { NexMarket, RouteDecision, ShapedMarketDraft } from "@/lib/types/nexmarkets";

export const AGENT_LAUNCH_BOND_USDC = 20;
export const AGENT_LAUNCH_METHOD = "agent_api";

type StoredAgent = AuthenticatedAgent & {
  agentProfileId: string | null;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
  pausedAt?: Date | null;
  revokedAt?: Date | null;
  lastLaunchAt?: Date | null;
};

type AgentValidationResult = {
  valid: boolean;
  failures: string[];
  draft: ShapedMarketDraft;
  decision: RouteDecision;
  launchBond: {
    totalUsdc: 20;
    feeUsdc: 10;
    refundableQualityBondUsdc: 10;
  };
  sourceQualification: ShapedMarketDraft["sourceQualification"] | null;
};

export class AgentLaunchError extends Error {
  status: number;
  code: string;
  action?: string;

  constructor(message: string, status = 400, code = "agent_launch_error", action?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.action = action;
  }
}

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeAgentPublicId(value?: string | null) {
  return normalizeProfilePublicId(value) || cleanIdName(String(value ?? ""));
}

export function agentIdLabel(value?: string | null) {
  return profileAgentIdLabel(value);
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function defaultChainId() {
  const value = Number(process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || process.env.NATIVE_EVENTS_CHAIN_ID || 84532);
  return Number.isFinite(value) ? value : 84532;
}

function templateIdFor(template: string) {
  return keccak256(stringToBytes(template));
}

function closeTimeSeconds(draft: ShapedMarketDraft) {
  const fallback = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const closeAt = draft.timeframe?.closeAt ? new Date(draft.timeframe.closeAt) : null;
  if (!closeAt || Number.isNaN(closeAt.getTime())) return fallback;
  return Math.floor(closeAt.getTime() / 1000);
}

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function launchBond() {
  return {
    totalUsdc: AGENT_LAUNCH_BOND_USDC as 20,
    feeUsdc: 10 as const,
    refundableQualityBondUsdc: 10 as const
  };
}

function idRequiredError() {
  return new AgentLaunchError(
    "Public agent launches require an agent .id. Mint or register an agent .id and continue the same launch.",
    403,
    "agent_id_required",
    "mint_or_register_agent_id"
  );
}

function ownerWallet(agent: AuthenticatedAgent) {
  if (!agent.walletAddress) throw new AgentLaunchError("Agent launch requires an owner wallet address.", 403, "agent_wallet_required");
  return agent.walletAddress;
}

function agentOwnerUser(agent: AuthenticatedAgent, publicId?: string | null): Promise<AuthUser> {
  const label = agentIdLabel(publicId ?? agent.publicId) ?? agent.identity ?? agent.name;
  return upsertWalletUser({
    walletAddress: ownerWallet(agent),
    displayName: label,
    primaryDomainName: label
  });
}

export function agentHasPublicId(agent: Pick<AuthenticatedAgent, "publicId">) {
  return Boolean(normalizeAgentPublicId(agent.publicId));
}

export function serializeAgentProfile(row: {
  id: string;
  name: string;
  status: string;
  walletAddress: string | null;
  identity: string | null;
  publicId: string | null;
  userId: string | null;
  scopes: unknown;
  dailyLaunchLimit: number;
  maxBondSpendUsdc: number;
  launchesToday: number;
  bondSpentTodayUsdc: number;
  limitsResetAt: Date | null;
  launchingDisabled: boolean;
  pausedAt: Date | null;
  revokedAt: Date | null;
  lastLaunchAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} | ({
  id: string;
  publicId: string | null;
  displayName: string;
  ownerUserId: string | null;
  ownerWallet: string | null;
  status: string;
  bio: string | null;
  avatarUrl: string | null;
  dailyLaunchLimit: number;
  maxBondSpendUsdc: number;
  launchesToday: number;
  bondSpentTodayUsdc: number;
  limitsResetAt: Date | null;
  launchingDisabled: boolean;
  pausedAt: Date | null;
  revokedAt: Date | null;
  lastLaunchAt: Date | null;
  erc8004Ref: string | null;
  erc8126ScoreRef: string | null;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}), scopes?: string[]) {
  if ("displayName" in row) return serializeAgentProfileRecord(row, scopes ?? []);
  return serializeLegacyAgentProfile(row, scopes);
}

async function loadStoredAgent(agent: AuthenticatedAgent): Promise<StoredAgent> {
  if (agent.source === "env") return agent;
  const db = requireDatabase();
  const row = await db.agentApiKey.findUnique({ where: { id: agent.id }, include: { agentProfile: true } });
  if (!row) throw new AgentLaunchError("Agent profile was not found.", 404, "agent_not_found");
  const profile = row.agentProfile ?? await ensureAgentProfileForAgent(agent);
  return {
    id: row.id,
    agentProfileId: profile?.id ?? row.agentProfileId,
    name: profile?.displayName ?? row.name,
    walletAddress: profile?.ownerWallet ?? row.walletAddress,
    identity: agentIdLabel(profile?.publicId ?? row.publicId) ?? profile?.displayName ?? row.identity,
    publicId: profile?.publicId ?? row.publicId,
    userId: profile?.ownerUserId ?? row.userId,
    scopes: normalizeAgentScopes(row.scopes),
    source: "database",
    dailyLaunchLimit: profile?.dailyLaunchLimit ?? row.dailyLaunchLimit,
    maxBondSpendUsdc: profile?.maxBondSpendUsdc ?? row.maxBondSpendUsdc,
    launchesToday: profile?.launchesToday ?? row.launchesToday,
    bondSpentTodayUsdc: profile?.bondSpentTodayUsdc ?? row.bondSpentTodayUsdc,
    limitsResetAt: profile?.limitsResetAt ?? row.limitsResetAt,
    launchingDisabled: profile?.launchingDisabled ?? row.launchingDisabled,
    status: profile?.status ?? row.status,
    pausedAt: profile?.pausedAt ?? row.pausedAt,
    revokedAt: profile?.revokedAt ?? row.revokedAt,
    lastLaunchAt: profile?.lastLaunchAt ?? row.lastLaunchAt,
    createdAt: profile?.createdAt ?? row.createdAt,
    updatedAt: profile?.updatedAt ?? row.updatedAt
  };
}

async function resetAgentLaunchWindowIfNeeded(agent: StoredAgent) {
  if (agent.source === "env") return agent;
  const today = utcDayStart();
  const current = agent.limitsResetAt;
  if (current && current.getTime() >= today.getTime()) return agent;
  const db = requireDatabase();
  if (agent.agentProfileId) {
    const row = await db.agentProfile.update({
      where: { id: agent.agentProfileId },
      data: {
        launchesToday: 0,
        bondSpentTodayUsdc: 0,
        limitsResetAt: today
      }
    });
    return { ...agent, launchesToday: row.launchesToday, bondSpentTodayUsdc: row.bondSpentTodayUsdc, limitsResetAt: row.limitsResetAt };
  }
  const row = await db.agentApiKey.update({
    where: { id: agent.id },
    data: {
      launchesToday: 0,
      bondSpentTodayUsdc: 0,
      limitsResetAt: today
    }
  });
  return { ...agent, launchesToday: row.launchesToday, bondSpentTodayUsdc: row.bondSpentTodayUsdc, limitsResetAt: row.limitsResetAt };
}

async function assertAgentCanPublicLaunch(agent: AuthenticatedAgent) {
  const stored = await resetAgentLaunchWindowIfNeeded(await loadStoredAgent(agent));
  if (!agentHasPublicId(stored)) throw idRequiredError();
  if (stored.status && stored.status !== "active") {
    throw new AgentLaunchError(`Agent is ${stored.status}. Resume or register a new agent before launching.`, 403, "agent_not_active");
  }
  if (stored.launchingDisabled) throw new AgentLaunchError("Launching is disabled for this agent.", 403, "agent_launching_disabled");
  let dailyLimit = stored.dailyLaunchLimit ?? 3;
  if (stored.agentProfileId) {
    const profile = await requireDatabase().agentProfile.findUnique({ where: { id: stored.agentProfileId } });
    if (profile) {
      const reputation = await calculateAgentReputation(profile.id);
      const policy = launchPolicyForReputation(profile, reputation);
      if (!policy.canLaunch) {
        throw new AgentLaunchError(policy.restrictionReason ?? "Agent reputation policy restricts public launches.", 403, "agent_reputation_restricted");
      }
      dailyLimit = policy.effectiveDailyLaunchLimit;
    }
  }
  const launchesToday = stored.launchesToday ?? 0;
  if (dailyLimit >= 0 && launchesToday >= dailyLimit) {
    throw new AgentLaunchError("Daily launch limit reached for this agent.", 429, "agent_daily_limit_reached");
  }
  const maxBondSpend = stored.maxBondSpendUsdc ?? 100;
  const spent = stored.bondSpentTodayUsdc ?? 0;
  if (spent + AGENT_LAUNCH_BOND_USDC > maxBondSpend) {
    throw new AgentLaunchError("Agent max bond spend would be exceeded by this launch.", 429, "agent_bond_limit_reached");
  }
  return stored;
}

async function markAgentLaunchBondUsage(agent: AuthenticatedAgent) {
  if (agent.source === "env") return;
  const db = requireDatabase();
  const profile = await loadAgentProfileForAgent(agent);
  if (profile) {
    await db.agentProfile.update({
      where: { id: profile.id },
      data: {
        launchesToday: { increment: 1 },
        bondSpentTodayUsdc: { increment: AGENT_LAUNCH_BOND_USDC },
        lastLaunchAt: new Date()
      }
    });
  }
  await db.agentApiKey.update({
    where: { id: agent.id },
    data: { lastLaunchAt: new Date() }
  });
}

export async function getAgentMe(agent: AuthenticatedAgent) {
  if (agent.source === "env") {
    return {
      profile: {
        id: agent.id,
        name: agent.name,
        status: "active",
        agentId: normalizeAgentPublicId(agent.publicId) || null,
        agentIdLabel: agentIdLabel(agent.publicId),
        ownerAccount: agent.walletAddress,
        identity: agent.identity,
        userId: agent.userId,
        scopes: agent.scopes,
        dailyLaunchLimit: null,
        maxBondSpendUsdc: null,
        launchesToday: null,
        bondSpentTodayUsdc: null,
        limitsResetAt: null,
        launchingDisabled: false,
        pausedAt: null,
        revokedAt: null,
        lastLaunchAt: null,
        createdAt: null,
        updatedAt: null
      },
      requiresAgentIdForPublicLaunch: !agentHasPublicId(agent)
    };
  }
  const db = requireDatabase();
  const row = await db.agentApiKey.findUnique({ where: { id: agent.id }, include: { agentProfile: true } });
  if (!row) throw new AgentLaunchError("Agent profile was not found.", 404, "agent_not_found");
  const profile = row.agentProfile ?? await ensureAgentProfileForAgent(agent);
  return {
    profile: profile ? serializeAgentProfile(profile, normalizeAgentScopes(row.scopes)) : serializeAgentProfile(row),
    requiresAgentIdForPublicLaunch: !(profile?.publicId ?? row.publicId)
  };
}

export async function getPublicAgent(idOrPublicId: string) {
  return getPublicAgentSummary(idOrPublicId);
}

export async function registerAgentId(input: { agent: AuthenticatedAgent; name: string }) {
  const publicId = normalizeAgentPublicId(input.name);
  if (!publicId) throw new AgentLaunchError("Enter a valid agent .id.", 400, "invalid_agent_id");
  if (input.agent.source === "env") {
    throw new AgentLaunchError("Env agents must set NEXMARKETS_AGENT_PUBLIC_ID.", 400, "env_agent_id_not_mutable");
  }
  const db = requireDatabase();
  const row = await db.agentApiKey.findUnique({ where: { id: input.agent.id }, include: { agentProfile: true } });
  if (!row) throw new AgentLaunchError("Agent profile was not found.", 404, "agent_not_found");
  const profile = row.agentProfile ?? await ensureAgentProfileForAgent(input.agent);
  const ownerUserId = profile?.ownerUserId ?? row.userId;
  const idName = ownerUserId
    ? await db.idName.findFirst({ where: { name: publicId, userId: ownerUserId, status: "active" } })
    : null;
  if (!idName) {
    throw new AgentLaunchError("This .id is not active for the agent owner yet. Mint it inline, then continue launching.", 409, "agent_id_not_minted", "mint_agent_id");
  }
  const updatedProfile = profile
    ? await db.agentProfile.update({
      where: { id: profile.id },
      data: {
        publicId,
        displayName: `${publicId}.id`
      }
    })
    : null;
  await db.agentApiKey.update({
    where: { id: input.agent.id },
    data: {
      publicId,
      identity: `${publicId}.id`
    }
  });
  await recordAgentAudit({ agentId: input.agent.id, agentProfileId: updatedProfile?.id ?? profile?.id, action: "register_agent_id", status: "ok", metadata: { publicId } });
  return updatedProfile ? serializeAgentProfile(updatedProfile, normalizeAgentScopes(row.scopes)) : serializeAgentProfile(row);
}

export async function mintAgentId(input: { agent: AuthenticatedAgent; name: string; txHash?: string | null }) {
  const publicId = normalizeAgentPublicId(input.name);
  if (!publicId) throw new AgentLaunchError("Enter a valid agent .id.", 400, "invalid_agent_id");
  if (input.agent.source === "env") {
    throw new AgentLaunchError("Env agents must set NEXMARKETS_AGENT_PUBLIC_ID.", 400, "env_agent_id_not_mutable");
  }
  const db = requireDatabase();
  const row = await db.agentApiKey.findUnique({ where: { id: input.agent.id }, include: { agentProfile: true } });
  const profile = row?.agentProfile ?? (row ? await ensureAgentProfileForAgent(input.agent) : null);
  const ownerWallet = profile?.ownerWallet ?? row?.walletAddress;
  const ownerUserId = profile?.ownerUserId ?? row?.userId;
  if (!row || !ownerWallet || !ownerUserId) {
    throw new AgentLaunchError("Agent .id minting requires an owner wallet and user account.", 403, "agent_owner_required");
  }
  if (!input.txHash) {
    const prepared = await prepareIdMint(publicId, ownerWallet, ownerUserId, null, "Wallet");
    return { id: prepared, profile: profile ? serializeAgentProfile(profile, normalizeAgentScopes(row.scopes)) : serializeAgentProfile(row), registrationRequired: true };
  }
  const minted = await mintIdName(publicId, "Wallet", ownerUserId, input.txHash);
  const updatedProfile = profile
    ? await db.agentProfile.update({
      where: { id: profile.id },
      data: {
        publicId,
        displayName: `${publicId}.id`
      }
    })
    : null;
  await db.agentApiKey.update({
    where: { id: input.agent.id },
    data: {
      publicId,
      identity: `${publicId}.id`
    }
  });
  await recordAgentAudit({ agentId: input.agent.id, agentProfileId: updatedProfile?.id ?? profile?.id, action: "mint_agent_id", status: "ok", metadata: { publicId, txHash: input.txHash } });
  return { id: minted, profile: updatedProfile ? serializeAgentProfile(updatedProfile, normalizeAgentScopes(row.scopes)) : serializeAgentProfile(row), registrationRequired: false };
}

export async function searchMarketsForAgent(input: { agent: AuthenticatedAgent; query?: string | null; limit?: number }) {
  const { listNexMarkets } = await import("@/lib/services/nexmarketsService");
  const markets = await listNexMarkets();
  const query = input.query?.trim().toLowerCase();
  const filtered = query
    ? markets.filter((market) => `${market.title} ${market.question} ${market.arena}`.toLowerCase().includes(query))
    : markets;
  const results = filtered.slice(0, Math.max(1, Math.min(input.limit ?? 20, 50)));
  const profile = await loadAgentProfileForAgent(input.agent).catch(() => null);
  await recordAgentAudit({ agentId: input.agent.id, agentProfileId: profile?.id ?? input.agent.agentProfileId, action: "search_markets", status: "ok", metadata: { query, count: results.length } });
  return results;
}

export async function draftMarketForLaunchAgent(input: {
  agent: AuthenticatedAgent;
  rawThesis: string;
  arenaHint?: ShapedMarketDraft["arena"];
}) {
  const draft = await composeNexMindMarketDraft({
    rawThesis: input.rawThesis,
    arenaHint: input.arenaHint,
    agentId: input.agent.id
  });
  const user = input.agent.walletAddress
    ? await agentOwnerUser(input.agent).catch(() => null)
    : null;
  const profile = await loadAgentProfileForAgent(input.agent).catch(() => null);
  const saved = await saveMarketDraft(draft, user, { creatorAgentId: input.agent.id, creatorAgentProfileId: profile?.id ?? input.agent.agentProfileId });
  await recordAgentAudit({
    agentId: input.agent.id,
    agentProfileId: profile?.id ?? input.agent.agentProfileId,
    action: "draft_market",
    status: "ok",
    metadata: { draftId: saved.id, title: draft.title, mode: "draft_only" }
  });
  return { draftId: saved.id, draft, mode: "draft_only" as const, requiresAgentIdForPublicLaunch: !agentHasPublicId(input.agent) };
}

export async function validateMarketForAgent(input: {
  agent: AuthenticatedAgent;
  draft?: ShapedMarketDraft | null;
  draftId?: string | null;
  forceCreate?: boolean;
  publicLaunchMode?: boolean;
}): Promise<AgentValidationResult> {
  const baseDraft = input.draft ?? (input.draftId ? await getMarketDraft(input.draftId) : null);
  if (!baseDraft) throw new AgentLaunchError("Market draft not found.", 404, "draft_not_found");
  const profile = await loadAgentProfileForAgent(input.agent).catch(() => null);
  const publicId = profile?.publicId ?? input.agent.publicId;
  const draft = await qualifyMarketDraftForLaunch({ draft: baseDraft });
  if (input.draftId) await updateMarketDraftShape(input.draftId, draft);
  const decision = await routeCheckNexMindMarket({ draft, agentId: input.agent.id });
  const failures: string[] = [];

  if (input.publicLaunchMode && !publicId) {
    failures.push("Public launch requires an agent .id.");
  }
  if (sourceQualificationBlocksLaunch(draft)) {
    failures.push(draft.sourceQualification?.launchBlockReason ?? "Source qualification blocked this market launch.");
  }
  if (draft.riskStatus !== "allowed") {
    failures.push(draft.blockedReason ?? `Draft is ${draft.riskStatus}.`);
  }
  if (!draft.resolution.sourceUrl || !/^https?:\/\//i.test(draft.resolution.sourceUrl)) {
    failures.push("Public launch requires a locked source URL.");
  }
  if (!input.forceCreate && decision.recommendedAction !== "launch_native") {
    failures.push("Duplicate launch prevention found an existing route or blocked this market.");
  }

  const valid = failures.length === 0;
  await recordAgentAudit({
    agentId: input.agent.id,
    agentProfileId: profile?.id ?? input.agent.agentProfileId,
    action: "validate_market",
    status: valid ? "ok" : "failed",
    metadata: { draftId: input.draftId, failures, recommendedAction: decision.recommendedAction }
  });
  return {
    valid,
    failures,
    draft,
    decision,
    launchBond: launchBond(),
    sourceQualification: draft.sourceQualification ?? null
  };
}

export async function previewMarketForAgent(input: {
  agent: AuthenticatedAgent;
  draft?: ShapedMarketDraft | null;
  draftId?: string | null;
  forceCreate?: boolean;
  publicLaunchMode?: boolean;
}) {
  const validation = await validateMarketForAgent(input);
  const profile = await loadAgentProfileForAgent(input.agent).catch(() => null);
  const publicId = agentIdLabel(profile?.publicId ?? input.agent.publicId);
  await recordAgentAudit({
    agentId: input.agent.id,
    agentProfileId: profile?.id ?? input.agent.agentProfileId,
    action: "preview_market",
    status: validation.valid ? "ok" : "needs_attention",
    metadata: { draftId: input.draftId, valid: validation.valid, failures: validation.failures }
  });
  return {
    draft: validation.draft,
    decision: validation.decision,
    validation: {
      valid: validation.valid,
      failures: validation.failures,
      sourceQualification: validation.sourceQualification
    },
    preview: {
      title: validation.draft.title,
      question: validation.draft.question,
      arena: validation.draft.arena,
      template: validation.draft.template,
      closeTime: validation.draft.timeframe?.closeAt ?? null,
      sourceUrl: validation.draft.resolution.sourceUrl,
      launchedByAgent: publicId,
      requiresAgentIdForPublicLaunch: input.publicLaunchMode !== false && !publicId,
      bond: validation.launchBond,
      receipt: {
        launchedByAgent: publicId ?? "agent .id required before public launch",
        ownerAccount: input.agent.walletAddress,
        launchMethod: AGENT_LAUNCH_METHOD,
        validationResult: validation.valid ? "pass" : "failed",
        creatorBondAmount: AGENT_LAUNCH_BOND_USDC,
        createdTimestamp: new Date().toISOString()
      }
    }
  };
}

async function upsertLaunchRequest(input: {
  agent: AuthenticatedAgent;
  agentProfileId?: string | null;
  idempotencyKey: string;
  requestHash: string;
  draftId?: string | null;
}) {
  const db = requireDatabase();
  const existing = await db.agentLaunchRequest.findUnique({
    where: { agentId_idempotencyKey: { agentId: input.agent.id, idempotencyKey: input.idempotencyKey } }
  });
  if (existing) {
    if (existing.requestHash !== input.requestHash) {
      throw new AgentLaunchError("Idempotency key was reused with a different launch request.", 409, "idempotency_key_conflict");
    }
    if (existing.response) {
      return { existing, response: { ...jsonRecord(existing.response), idempotent: true } };
    }
    throw new AgentLaunchError("A launch with this idempotency key is already being processed.", 409, "launch_request_in_progress");
  }
  const row = await db.agentLaunchRequest.create({
    data: {
      agentId: input.agent.id,
      agentProfileId: input.agentProfileId ?? input.agent.agentProfileId ?? undefined,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      draftId: input.draftId ?? undefined,
      status: "processing"
    }
  });
  return { existing: row, response: null };
}

async function completeLaunchRequest(input: {
  requestId: string;
  marketId?: string | null;
  status: string;
  validation?: unknown;
  response?: unknown;
}) {
  const db = requireDatabase();
  await db.agentLaunchRequest.update({
    where: { id: input.requestId },
    data: {
      marketId: input.marketId ?? undefined,
      status: input.status,
      validation: input.validation === undefined ? undefined : jsonInput(input.validation),
      response: input.response === undefined ? undefined : jsonInput(input.response)
    }
  });
}

async function createAgentLaunchReceipt(input: {
  agent: StoredAgent;
  market: NexMarket;
  owner: AuthUser;
  validation: AgentValidationResult;
  launchMethod: string;
  idempotencyKey: string;
  rulesHash: string;
  metadataHash: string;
}) {
  const db = requireDatabase();
  const publicId = normalizeAgentPublicId(input.agent.publicId);
  const label = agentIdLabel(publicId);
  const receiptIdentity = [
    ...(input.agent.agentProfileId ? [{ agentProfileId: input.agent.agentProfileId }] : []),
    { agentId: input.agent.id }
  ];
  const existing = await db.marketReceipt.findFirst({
    where: {
      marketId: input.market.id,
      OR: receiptIdentity,
      proof: "Agent public launch receipt"
    },
    orderBy: { createdAt: "desc" }
  });
  if (existing) {
    return {
      id: existing.id,
      marketId: existing.marketId,
      title: existing.title,
      proof: existing.proof,
      publicUrl: existing.publicUrl,
      createdAt: existing.createdAt.toISOString(),
      payload: existing.payload
    };
  }
  const createdTimestamp = new Date();
  const payload = {
    type: "agent_public_launch",
    launchedByAgent: label,
    agentId: input.agent.id,
    agentProfileId: input.agent.agentProfileId,
    agentPublicId: publicId,
    ownerAccount: input.owner.walletAddress,
    launchMethod: input.launchMethod,
    validationResult: {
      valid: input.validation.valid,
      failures: input.validation.failures,
      recommendedAction: input.validation.decision.recommendedAction,
      sourceQualification: input.validation.sourceQualification
    },
    creatorBondAmount: AGENT_LAUNCH_BOND_USDC,
    createdTimestamp: createdTimestamp.toISOString(),
    idempotencyKey: input.idempotencyKey,
    rulesHash: input.rulesHash,
    metadataHash: input.metadataHash
  };
  const row = await db.marketReceipt.create({
    data: {
      marketId: input.market.id,
      userId: input.owner.id,
      walletAddress: input.owner.walletAddress,
      title: `Launched ${input.market.title}`,
      proof: "Agent public launch receipt",
      publicUrl: `/market/${input.market.id}`,
      agentId: input.agent.id,
      agentProfileId: input.agent.agentProfileId ?? undefined,
      agentPublicId: publicId,
      launchMethod: input.launchMethod,
      payload: jsonInput(payload)
    }
  });
  return {
    id: row.id,
    marketId: row.marketId,
    title: row.title,
    proof: row.proof,
    publicUrl: row.publicUrl,
    createdAt: row.createdAt.toISOString(),
    payload
  };
}

export async function launchMarketForAgent(input: {
  agent: AuthenticatedAgent;
  draft?: ShapedMarketDraft | null;
  draftId?: string | null;
  chainId?: number;
  forceCreate?: boolean;
  idempotencyKey?: string | null;
  launchMethod?: string;
}) {
  const keyMaterial = {
    draftId: input.draftId ?? null,
    draft: input.draft ?? null,
    chainId: input.chainId ?? defaultChainId(),
    forceCreate: Boolean(input.forceCreate),
    launchMethod: input.launchMethod ?? AGENT_LAUNCH_METHOD
  };
  const requestHash = stableHash(keyMaterial);
  const idempotencyKey = (input.idempotencyKey?.trim() || requestHash).slice(0, 160);
  const profile = await loadAgentProfileForAgent(input.agent).catch(() => null);
  const launchRequest = await upsertLaunchRequest({
    agent: input.agent,
    agentProfileId: profile?.id ?? input.agent.agentProfileId,
    idempotencyKey,
    requestHash,
    draftId: input.draftId
  });
  if (launchRequest.response) return launchRequest.response;

  try {
    const storedAgent = await assertAgentCanPublicLaunch(input.agent);
    const validation = await validateMarketForAgent({
      agent: { ...input.agent, agentProfileId: storedAgent.agentProfileId, publicId: storedAgent.publicId },
      draft: input.draft,
      draftId: input.draftId,
      forceCreate: input.forceCreate,
      publicLaunchMode: true
    });
    if (!validation.valid) {
      throw new AgentLaunchError(validation.failures[0] ?? "Market validation failed.", 400, "market_validation_failed");
    }

    const launchAgent = { ...input.agent, agentProfileId: storedAgent.agentProfileId, publicId: storedAgent.publicId, walletAddress: storedAgent.walletAddress };
    const owner = await agentOwnerUser(launchAgent, storedAgent.publicId);
    const chainId = input.chainId ?? defaultChainId();
    const rulesHash = rulesHashForDraft(validation.draft);
    const metadataHash = metadataHashForDraft(validation.draft);
    const closeTime = closeTimeSeconds(validation.draft);
    const market = await createNativeMarketRecord({
      draft: validation.draft,
      user: owner,
      chainId,
      rulesHash,
      metadataHash,
      closeTime: new Date(closeTime * 1000),
      createdByType: "agent",
      creatorAgentId: input.agent.id,
      creatorAgentProfileId: storedAgent.agentProfileId,
      creatorAgentPublicId: normalizeAgentPublicId(storedAgent.publicId)
    });
    const contracts = nexMarketsContracts(chainId);
    const factoryAddress = contracts?.marketFactory ?? null;
    const receipt = await createAgentLaunchReceipt({
      agent: storedAgent,
      market,
      owner,
      validation,
      launchMethod: input.launchMethod ?? AGENT_LAUNCH_METHOD,
      idempotencyKey,
      rulesHash,
      metadataHash
    });
    if (input.draftId && !input.draftId.startsWith("draft_")) {
      const db = requireDatabase();
      await db.marketDraft.updateMany({
        where: { id: input.draftId },
        data: { marketId: market.id, creatorAgentId: input.agent.id, creatorAgentProfileId: storedAgent.agentProfileId ?? undefined }
      });
    }
    await markAgentLaunchBondUsage(storedAgent);
    await recordAgentReputationEvent({
      agentProfileId: storedAgent.agentProfileId,
      marketId: market.id,
      type: "market_launch",
      weight: 1,
      metadata: { bondUsdc: AGENT_LAUNCH_BOND_USDC, rulesHash, metadataHash }
    });
    await recordAgentAudit({
      agentId: input.agent.id,
      agentProfileId: storedAgent.agentProfileId,
      marketId: market.id,
      action: "launch_market",
      status: "ready_to_launch",
      metadata: { idempotencyKey, rulesHash, metadataHash, receiptId: receipt.id, bondUsdc: AGENT_LAUNCH_BOND_USDC }
    });

    const response = {
      action: "create_new_market",
      market,
      receipt,
      validation: {
        valid: true,
        failures: [],
        sourceQualification: validation.sourceQualification,
        decision: validation.decision
      },
      transaction: {
        chainId,
        factoryAddress,
        launchStakeVaultAddress: contracts?.launchStakeVault ?? null,
        collateralAddress: contracts?.collateral ?? null,
        feeRouterAddress: contracts?.feeRouter ?? null,
        rulesHash,
        metadataHash,
        template: validation.draft.template,
        templateId: templateIdFor(validation.draft.template),
        closeTime,
        authorization: factoryAddress
          ? await signNativeLaunchAuthorization({
            chainId,
            factoryAddress,
            creator: owner.walletAddress,
            rulesHash,
            metadataHash,
            template: validation.draft.template,
            closeTime
          })
          : null,
        launchBond: launchBond(),
        launchedByAgent: agentIdLabel(storedAgent.publicId),
        ownerAccount: owner.walletAddress
      },
      idempotencyKey
    };
    await completeLaunchRequest({
      requestId: launchRequest.existing.id,
      marketId: market.id,
      status: "ready_to_launch",
      validation: response.validation,
      response
    });
    return response;
  } catch (error) {
    await completeLaunchRequest({
      requestId: launchRequest.existing.id,
      status: "failed",
      validation: error instanceof AgentLaunchError ? { error: error.message, code: error.code } : { error: error instanceof Error ? error.message : "Unknown error" }
    }).catch(() => undefined);
    await recordAgentAudit({
      agentId: input.agent.id,
      agentProfileId: profile?.id ?? input.agent.agentProfileId,
      action: "launch_market",
      status: "failed",
      metadata: { idempotencyKey, error: error instanceof Error ? error.message : String(error) }
    });
    throw error;
  }
}

export async function listAgentLaunches(idOrPublicId: string) {
  const data = await getAgentProfileByIdOrPublicId(idOrPublicId);
  if (!data) return null;
  return {
    agent: data.profile,
    reputation: data.reputation,
    launches: data.markets.map((market) => ({
      id: market.id,
      title: market.title,
      status: market.status,
      publicUrl: market.publicUrl,
      createdAt: market.createdAt,
      launchStakeStatus: null,
      bondAmount: AGENT_LAUNCH_BOND_USDC
    })),
    receipts: data.receipts
  };
}

export async function listDashboardAgents(userId?: string | null) {
  return listOwnedAgentProfiles(userId);
}

export async function updateOwnedAgentControls(input: {
  user: AuthUser;
  agentId: string;
  action?: "pause" | "resume" | "revoke" | "disable_launching" | "enable_launching";
  dailyLaunchLimit?: number;
  maxBondSpendUsdc?: number;
}) {
  const updated = await updateOwnedAgentProfileControls({
    userId: input.user.id,
    profileId: input.agentId,
    action: input.action,
    dailyLaunchLimit: input.dailyLaunchLimit,
    maxBondSpendUsdc: input.maxBondSpendUsdc
  }).catch((error) => {
    throw new AgentLaunchError(error instanceof Error ? error.message : "Agent profile was not found for this owner.", 404, "agent_not_found");
  });
  await recordAgentAudit({
    agentProfileId: input.agentId,
    action: "update_agent_controls",
    status: "ok",
    metadata: { action: input.action, dailyLaunchLimit: input.dailyLaunchLimit, maxBondSpendUsdc: input.maxBondSpendUsdc }
  });
  return updated;
}
