import { requireDatabase, withDatabase } from "@/lib/server/db";
import { normalizeAgentScopes, type AuthenticatedAgent } from "@/lib/services/bankr/agentAuthService";

export const AGENT_REPUTATION_VERSION = "nexmarkets-agent-reputation-v1";

type ProfileRow = {
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
};

type ApiKeyRow = {
  id: string;
  name: string;
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
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type ExternalCredentialInput = {
  standard: "erc8004" | "erc8126" | "custom";
  chainId?: number;
  registry?: string;
  subjectId: string;
  score?: number;
  payload?: unknown;
  verifiedAt?: string;
};

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeAgentPublicId(value?: string | null) {
  return String(value ?? "").trim().replace(/\.id$/i, "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "";
}

export function agentIdLabel(value?: string | null) {
  const publicId = normalizeAgentPublicId(value);
  return publicId ? `${publicId}.id` : null;
}

export function serializeAgentProfileRecord(row: ProfileRow, scopes: string[] = []) {
  const publicId = normalizeAgentPublicId(row.publicId);
  return {
    id: row.id,
    name: row.displayName,
    status: row.status,
    agentId: publicId || null,
    agentIdLabel: publicId ? `${publicId}.id` : null,
    ownerAccount: row.ownerWallet,
    identity: publicId ? `${publicId}.id` : row.displayName,
    userId: row.ownerUserId,
    scopes,
    dailyLaunchLimit: row.dailyLaunchLimit,
    maxBondSpendUsdc: row.maxBondSpendUsdc,
    launchesToday: row.launchesToday,
    bondSpentTodayUsdc: row.bondSpentTodayUsdc,
    limitsResetAt: row.limitsResetAt?.toISOString() ?? null,
    launchingDisabled: row.launchingDisabled,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastLaunchAt: row.lastLaunchAt?.toISOString() ?? null,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    erc8004Ref: row.erc8004Ref,
    erc8126ScoreRef: row.erc8126ScoreRef,
    joinDate: row.joinedAt.toISOString(),
    joinedAt: row.joinedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function serializeLegacyAgentProfile(row: ApiKeyRow, scopes?: string[]) {
  const publicId = normalizeAgentPublicId(row.publicId);
  return {
    id: row.id,
    name: row.identity ?? (publicId ? `${publicId}.id` : row.name),
    status: row.status,
    agentId: publicId || null,
    agentIdLabel: publicId ? `${publicId}.id` : null,
    ownerAccount: row.walletAddress,
    identity: row.identity,
    userId: row.userId,
    scopes: scopes ?? normalizeAgentScopes(row.scopes),
    dailyLaunchLimit: row.dailyLaunchLimit,
    maxBondSpendUsdc: row.maxBondSpendUsdc,
    launchesToday: row.launchesToday,
    bondSpentTodayUsdc: row.bondSpentTodayUsdc,
    limitsResetAt: row.limitsResetAt?.toISOString() ?? null,
    launchingDisabled: row.launchingDisabled,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastLaunchAt: row.lastLaunchAt?.toISOString() ?? null,
    bio: null,
    avatarUrl: null,
    erc8004Ref: null,
    erc8126ScoreRef: null,
    joinDate: row.createdAt.toISOString(),
    joinedAt: row.createdAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function serializeExternalCredential(row: {
  id?: string;
  standard: string;
  chainId: number | null;
  registry: string | null;
  subjectId: string | null;
  score: number | null;
  verifiedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: row.id,
    standard: row.standard,
    chainId: row.chainId,
    registry: row.registry,
    subjectId: row.subjectId,
    score: row.score,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString()
  };
}

export async function ensureAgentProfileForAgent(agent: AuthenticatedAgent) {
  if (agent.source === "env") return null;
  const db = requireDatabase();
  const row = await db.agentApiKey.findUnique({
    where: { id: agent.id },
    include: { agentProfile: true }
  });
  if (!row) return null;
  if (row.agentProfile) return row.agentProfile;
  const publicId = normalizeAgentPublicId(row.publicId);
  const profile = await db.agentProfile.create({
    data: {
      publicId: publicId || undefined,
      displayName: row.identity ?? agentIdLabel(publicId) ?? row.name,
      ownerUserId: row.userId ?? undefined,
      ownerWallet: row.walletAddress ?? undefined,
      status: row.status,
      dailyLaunchLimit: row.dailyLaunchLimit,
      maxBondSpendUsdc: row.maxBondSpendUsdc,
      launchesToday: row.launchesToday,
      bondSpentTodayUsdc: row.bondSpentTodayUsdc,
      limitsResetAt: row.limitsResetAt ?? undefined,
      launchingDisabled: row.launchingDisabled,
      pausedAt: row.pausedAt ?? undefined,
      revokedAt: row.revokedAt ?? undefined,
      lastLaunchAt: row.lastLaunchAt ?? undefined,
      joinedAt: row.createdAt
    }
  });
  await db.agentApiKey.update({ where: { id: row.id }, data: { agentProfileId: profile.id } });
  return profile;
}

export async function loadAgentProfileForAgent(agent: AuthenticatedAgent) {
  if (agent.source === "env") return null;
  const db = requireDatabase();
  const profile = agent.agentProfileId
    ? await db.agentProfile.findUnique({ where: { id: agent.agentProfileId } })
    : null;
  return profile ?? ensureAgentProfileForAgent(agent);
}

async function profileApiKeyIds(profileId: string) {
  const db = requireDatabase();
  const keys = await db.agentApiKey.findMany({
    where: { agentProfileId: profileId },
    select: { id: true }
  });
  return keys.map((key) => key.id);
}

export async function calculateAgentReputation(profileId: string) {
  const db = requireDatabase();
  const keyIds = await profileApiKeyIds(profileId);
  const markets = await db.market.findMany({
    where: {
      OR: [
        { creatorAgentProfileId: profileId },
        ...(keyIds.length ? [{ creatorAgentId: { in: keyIds } }] : [])
      ]
    },
    orderBy: { createdAt: "desc" }
  });
  const marketIds = markets.map((market) => market.id);
  const [fees, disputes] = await Promise.all([
    marketIds.length ? db.creatorFeeLedger.findMany({ where: { marketId: { in: marketIds } } }) : Promise.resolve([]),
    marketIds.length ? db.marketDispute.findMany({ where: { marketId: { in: marketIds } } }) : Promise.resolve([])
  ]);

  const marketsLaunched = markets.length;
  const creatorFeesEarned = fees.reduce((sum, fee) => sum + fee.creatorFeeUsdc, 0);
  const invalidMarkets = markets.filter((market) => market.status === "invalid_refund" || market.finalOutcome === "invalid").length;
  const disputedIds = new Set([
    ...disputes.map((dispute) => dispute.marketId),
    ...markets.filter((market) => market.status === "disputed").map((market) => market.id)
  ]);
  const disputedMarkets = disputedIds.size;
  const resolvedMarkets = markets.filter((market) => market.finalOutcome || ["settled", "invalid_refund"].includes(market.status)).length;
  const accurateResolutions = Math.max(0, resolvedMarkets - invalidMarkets);
  const launchSuccessRate = marketsLaunched ? (marketsLaunched - invalidMarkets) / marketsLaunched : 0;
  const resolutionAccuracy = resolvedMarkets ? accurateResolutions / resolvedMarkets : 0;
  const invalidMarketRate = marketsLaunched ? invalidMarkets / marketsLaunched : 0;
  const disputePenaltyAdjusted = marketsLaunched ? Math.max(0, 1 - disputedMarkets / marketsLaunched) : 0.8;
  const communityTrustScore = marketsLaunched
    ? clamp(
      40 * launchSuccessRate +
      30 * resolutionAccuracy +
      20 * (1 - invalidMarketRate) +
      10 * disputePenaltyAdjusted
    )
    : 50;
  const trustTier = marketsLaunched === 0
    ? "new"
    : communityTrustScore >= 85
      ? "trusted"
      : communityTrustScore >= 65
        ? "clean"
        : communityTrustScore >= 40
          ? "watch"
          : "restricted";

  return {
    marketsLaunched,
    creatorFeesEarned,
    invalidMarkets,
    disputedMarkets,
    resolvedMarkets,
    accurateResolutions,
    launchSuccessRate,
    resolutionAccuracy,
    invalidMarketRate,
    communityTrustScore,
    trustTier,
    calculationVersion: AGENT_REPUTATION_VERSION,
    calculatedAt: new Date().toISOString()
  };
}

export async function saveAgentReputationSnapshot(profileId: string) {
  const reputation = await calculateAgentReputation(profileId);
  const db = requireDatabase();
  await db.agentReputationSnapshot.create({
    data: {
      agentProfileId: profileId,
      marketsLaunched: reputation.marketsLaunched,
      creatorFeesEarned: reputation.creatorFeesEarned,
      invalidMarkets: reputation.invalidMarkets,
      disputedMarkets: reputation.disputedMarkets,
      resolvedMarkets: reputation.resolvedMarkets,
      accurateResolutions: reputation.accurateResolutions,
      launchSuccessRate: reputation.launchSuccessRate,
      resolutionAccuracy: reputation.resolutionAccuracy,
      invalidMarketRate: reputation.invalidMarketRate,
      communityTrustScore: reputation.communityTrustScore,
      calculationVersion: reputation.calculationVersion
    }
  });
  return reputation;
}

export function launchPolicyForReputation(profile: ProfileRow, reputation: Awaited<ReturnType<typeof calculateAgentReputation>>) {
  const baseDailyLimit = profile.dailyLaunchLimit;
  let effectiveDailyLaunchLimit = baseDailyLimit;
  let restrictionReason: string | null = null;
  let canLaunch = profile.status === "active" && !profile.launchingDisabled;

  if (reputation.marketsLaunched === 0) {
    effectiveDailyLaunchLimit = Math.min(baseDailyLimit, 1);
  }
  if (reputation.marketsLaunched >= 3 && reputation.communityTrustScore < 60) {
    effectiveDailyLaunchLimit = Math.min(effectiveDailyLaunchLimit, 1);
    restrictionReason = "Low-reputation agents are limited to one public launch per day.";
  }
  if (reputation.marketsLaunched >= 3 && (reputation.communityTrustScore < 35 || reputation.invalidMarketRate >= 0.25)) {
    canLaunch = false;
    restrictionReason = "Agent public launches are restricted until reputation improves or the owner reviews this agent.";
  }

  return {
    canLaunch,
    dailyLaunchLimit: baseDailyLimit,
    effectiveDailyLaunchLimit,
    maxBondSpendUsdc: profile.maxBondSpendUsdc,
    requiredLaunchBondUsdc: 20,
    restrictionReason
  };
}

export function computedAgentBadges(reputation: Awaited<ReturnType<typeof calculateAgentReputation>>) {
  const badges: Array<{ code: string; label: string; description: string; tier: string }> = [];
  if (reputation.marketsLaunched > 0) badges.push({ code: "first-launch", label: "First launch", description: "Created at least one public market.", tier: "standard" });
  if (reputation.marketsLaunched >= 10) badges.push({ code: "ten-launches", label: "10 launches", description: "Created ten public markets.", tier: "silver" });
  if (reputation.marketsLaunched >= 3 && reputation.invalidMarkets === 0) badges.push({ code: "clean-launches", label: "No invalid markets", description: "No launched market has resolved invalid.", tier: "gold" });
  if (reputation.disputedMarkets > 0 && reputation.communityTrustScore >= 65) badges.push({ code: "dispute-tested", label: "Dispute-tested", description: "Maintained clean reputation through disputed markets.", tier: "silver" });
  if (reputation.trustTier === "trusted") badges.push({ code: "trusted-agent", label: "Trusted agent", description: "High launch success and resolution quality.", tier: "gold" });
  if (reputation.trustTier === "restricted") badges.push({ code: "restricted", label: "Restricted", description: "Launches are restricted by reputation policy.", tier: "risk" });
  return badges;
}

export async function upsertComputedBadges(profileId: string, reputation: Awaited<ReturnType<typeof calculateAgentReputation>>) {
  const db = requireDatabase();
  const badges = computedAgentBadges(reputation);
  for (const badge of badges) {
    await db.agentBadge.upsert({
      where: { agentProfileId_code: { agentProfileId: profileId, code: badge.code } },
      update: { label: badge.label, description: badge.description, tier: badge.tier },
      create: { agentProfileId: profileId, ...badge }
    });
  }
  return badges;
}

export async function getAgentProfileByIdOrPublicId(idOrPublicId: string) {
  const publicId = normalizeAgentPublicId(idOrPublicId);
  return withDatabase(
    async (db) => {
      const profile = await db.agentProfile.findFirst({
        where: {
          OR: [
            { id: idOrPublicId },
            ...(publicId ? [{ publicId }] : [])
          ]
        },
        include: {
          apiKeys: { select: { id: true, scopes: true, status: true, createdAt: true } },
          badges: { orderBy: { awardedAt: "desc" } },
          externalCredentials: { orderBy: { createdAt: "desc" } }
        }
      });
      if (!profile) return null;
      const scopes = Array.from(new Set(profile.apiKeys.flatMap((key) => normalizeAgentScopes(key.scopes))));
      const reputation = await calculateAgentReputation(profile.id);
      await upsertComputedBadges(profile.id, reputation).catch(() => undefined);
      const latestBadges = await db.agentBadge.findMany({ where: { agentProfileId: profile.id }, orderBy: { awardedAt: "desc" } });
      const keyIds = profile.apiKeys.map((key) => key.id);
      const markets = await db.market.findMany({
        where: {
          OR: [
            { creatorAgentProfileId: profile.id },
            ...(keyIds.length ? [{ creatorAgentId: { in: keyIds } }] : [])
          ]
        },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      const receipts = await db.marketReceipt.findMany({
        where: {
          OR: [
            { agentProfileId: profile.id },
            ...(keyIds.length ? [{ agentId: { in: keyIds } }] : [])
          ]
        },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      const policy = launchPolicyForReputation(profile, reputation);
      return {
        profile: serializeAgentProfileRecord(profile, scopes),
        reputation,
        policy,
        badges: latestBadges.map((badge) => ({
          code: badge.code,
          label: badge.label,
          description: badge.description,
          tier: badge.tier,
          awardedAt: badge.awardedAt.toISOString()
        })),
        externalCredentials: profile.externalCredentials.map((credential) => serializeExternalCredential(credential)),
        markets: markets.map((market) => ({
          id: market.id,
          title: market.title,
          status: market.status,
          arena: market.arena,
          publicUrl: `/market/${market.id}`,
          createdAt: market.createdAt.toISOString()
        })),
        receipts: receipts.map((receipt) => ({
          id: receipt.id,
          marketId: receipt.marketId,
          title: receipt.title,
          proof: receipt.proof,
          publicUrl: receipt.publicUrl,
          createdAt: receipt.createdAt.toISOString()
        }))
      };
    },
    async () => null
  );
}

export async function getPublicAgentSummary(idOrPublicId: string) {
  const data = await getAgentProfileByIdOrPublicId(idOrPublicId);
  if (!data) return null;
  return {
    id: data.profile.id,
    name: data.profile.name,
    status: data.profile.status,
    agentId: data.profile.agentId,
    agentIdLabel: data.profile.agentIdLabel,
    ownerAccount: data.profile.ownerAccount,
    scopes: data.profile.scopes,
    launchingDisabled: data.profile.launchingDisabled,
    joinDate: data.profile.joinDate,
    reputation: data.reputation,
    badges: data.badges
  };
}

export async function listOwnedAgentProfiles(userId?: string | null) {
  if (!userId) return [];
  return withDatabase(
    async (db) => {
      const profiles = await db.agentProfile.findMany({
        where: { ownerUserId: userId },
        include: {
          apiKeys: { select: { id: true, scopes: true, status: true } },
          badges: { orderBy: { awardedAt: "desc" } }
        },
        orderBy: { createdAt: "desc" },
        take: 20
      });
      return Promise.all(profiles.map(async (profile) => {
        const scopes = Array.from(new Set(profile.apiKeys.flatMap((key) => normalizeAgentScopes(key.scopes))));
        const reputation = await calculateAgentReputation(profile.id);
        const policy = launchPolicyForReputation(profile, reputation);
        const keyIds = profile.apiKeys.map((key) => key.id);
        const [markets, drafts, failures, receipts] = await Promise.all([
          db.market.findMany({
            where: { OR: [{ creatorAgentProfileId: profile.id }, ...(keyIds.length ? [{ creatorAgentId: { in: keyIds } }] : [])] },
            orderBy: { createdAt: "desc" },
            take: 20
          }),
          db.marketDraft.findMany({
            where: { OR: [{ creatorAgentProfileId: profile.id }, ...(keyIds.length ? [{ creatorAgentId: { in: keyIds } }] : [])] },
            orderBy: { createdAt: "desc" },
            take: 20
          }),
          db.agentMarketAuditLog.findMany({
            where: { OR: [{ agentProfileId: profile.id }, ...(keyIds.length ? [{ agentId: { in: keyIds } }] : [])], status: "failed" },
            orderBy: { createdAt: "desc" },
            take: 20
          }),
          db.marketReceipt.findMany({
            where: { OR: [{ agentProfileId: profile.id }, ...(keyIds.length ? [{ agentId: { in: keyIds } }] : [])] },
            orderBy: { createdAt: "desc" },
            take: 20
          })
        ]);
        return {
          ...serializeAgentProfileRecord(profile, scopes),
          reputation,
          policy,
          badges: profile.badges.map((badge) => ({
            code: badge.code,
            label: badge.label,
            description: badge.description,
            tier: badge.tier,
            awardedAt: badge.awardedAt.toISOString()
          })),
          launchHistory: markets.map((market) => ({
            id: market.id,
            title: market.title,
            status: market.status,
            publicUrl: `/market/${market.id}`,
            createdAt: market.createdAt.toISOString(),
            bond: "$20"
          })),
          drafts: drafts.map((draft) => {
            const shaped = draft.shaped && typeof draft.shaped === "object" && !Array.isArray(draft.shaped) ? draft.shaped as Record<string, unknown> : {};
            return {
              id: draft.id,
              title: typeof shaped.title === "string" ? shaped.title : draft.rawThesis,
              riskStatus: draft.riskStatus,
              createdAt: draft.createdAt.toISOString()
            };
          }),
          validationFailures: failures.map((failure) => ({
            id: failure.id,
            action: failure.action,
            status: failure.status,
            detail: failure.metadata,
            createdAt: failure.createdAt.toISOString()
          })),
          receipts: receipts.map((receipt) => ({
            id: receipt.id,
            marketId: receipt.marketId,
            title: receipt.title,
            proof: receipt.proof,
            publicUrl: receipt.publicUrl,
            createdAt: receipt.createdAt.toISOString()
          }))
        };
      }));
    },
    async () => []
  );
}

export async function updateOwnedAgentProfileControls(input: {
  userId: string;
  profileId: string;
  action?: "pause" | "resume" | "revoke" | "disable_launching" | "enable_launching";
  dailyLaunchLimit?: number;
  maxBondSpendUsdc?: number;
}) {
  const db = requireDatabase();
  const profile = await db.agentProfile.findFirst({ where: { id: input.profileId, ownerUserId: input.userId } });
  if (!profile) throw new Error("Agent profile was not found for this owner.");
  const data: Record<string, unknown> = {};
  if (input.action === "pause") {
    data.status = "paused";
    data.pausedAt = new Date();
  }
  if (input.action === "resume") {
    data.status = "active";
    data.pausedAt = null;
  }
  if (input.action === "revoke") {
    data.status = "revoked";
    data.revokedAt = new Date();
    data.launchingDisabled = true;
  }
  if (input.action === "disable_launching") data.launchingDisabled = true;
  if (input.action === "enable_launching") data.launchingDisabled = false;
  if (typeof input.dailyLaunchLimit === "number") data.dailyLaunchLimit = Math.max(0, Math.min(100, Math.floor(input.dailyLaunchLimit)));
  if (typeof input.maxBondSpendUsdc === "number") data.maxBondSpendUsdc = Math.max(0, Math.min(100_000, input.maxBondSpendUsdc));
  const updated = await db.agentProfile.update({ where: { id: input.profileId }, data });
  return serializeAgentProfileRecord(updated);
}

export async function upsertOwnedAgentExternalCredential(input: {
  userId: string;
  idOrPublicId: string;
  credential: ExternalCredentialInput;
}) {
  const db = requireDatabase();
  const publicId = normalizeAgentPublicId(input.idOrPublicId);
  const profile = await db.agentProfile.findFirst({
    where: {
      ownerUserId: input.userId,
      OR: [
        { id: input.idOrPublicId },
        ...(publicId ? [{ publicId }] : [])
      ]
    }
  });
  if (!profile) throw new Error("Agent profile was not found for this owner.");
  const verifiedAt = input.credential.verifiedAt ? new Date(input.credential.verifiedAt) : undefined;
  const data = {
    standard: input.credential.standard,
    chainId: input.credential.chainId ?? undefined,
    registry: input.credential.registry ?? undefined,
    subjectId: input.credential.subjectId,
    score: input.credential.score ?? undefined,
    payload: input.credential.payload === undefined ? undefined : jsonInput(input.credential.payload),
    verifiedAt
  };
  const existing = await db.agentExternalCredential.findFirst({
    where: {
      agentProfileId: profile.id,
      standard: input.credential.standard,
      subjectId: input.credential.subjectId
    }
  });
  const credential = existing
    ? await db.agentExternalCredential.update({ where: { id: existing.id }, data })
    : await db.agentExternalCredential.create({ data: { agentProfileId: profile.id, ...data } });

  const profileUpdate: Record<string, string> = {};
  if (input.credential.standard === "erc8004") profileUpdate.erc8004Ref = input.credential.subjectId;
  if (input.credential.standard === "erc8126") profileUpdate.erc8126ScoreRef = input.credential.subjectId;
  if (Object.keys(profileUpdate).length) {
    await db.agentProfile.update({ where: { id: profile.id }, data: profileUpdate });
  }
  return serializeExternalCredential(credential);
}

export async function recordAgentReputationEvent(input: {
  agentProfileId?: string | null;
  marketId?: string | null;
  type: string;
  weight: number;
  metadata?: unknown;
}) {
  if (!input.agentProfileId) return false;
  return withDatabase(
    async (db) => {
      await db.agentReputationEvent.create({
        data: {
          agentProfileId: input.agentProfileId!,
          marketId: input.marketId ?? undefined,
          type: input.type,
          weight: input.weight,
          metadata: input.metadata === undefined ? undefined : jsonInput(input.metadata)
        }
      });
      return true;
    },
    async () => false
  );
}
