import { getAddress, isAddress } from "viem";
import { requireDatabase } from "@/lib/server/db";
import { recordAgentAudit } from "@/lib/services/bankr/agentAuthService";

type Database = ReturnType<typeof requireDatabase>;
type NativeSide = "ride" | "fade";

type WalletProfile = {
  agentProfileId: string | null;
  publicId: string | null;
  displayName: string | null;
};

type TradeRiskInput = {
  db: Database;
  market: {
    id: string;
    creatorWallet?: string | null;
    creatorAgentProfileId?: string | null;
    creatorAgentPublicId?: string | null;
  };
  trade: {
    id: string;
    walletAddress: string;
    side: NativeSide;
    notionalUsdc: number;
    txHash: string;
    createdAt?: Date;
  };
  source?: string;
};

type FundingEdgeInput = {
  funderWallet: string;
  fundedWallet: string;
  txHash: string;
  logIndex?: number | null;
  tokenAddress?: string | null;
  chainId?: number | null;
  amountUsdc?: number | null;
  blockNumber?: number | null;
  observedAt?: string | Date | null;
  source?: string | null;
  metadata?: unknown;
};

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function numberEnv(names: string[], fallback: number) {
  for (const name of names) {
    const value = Number(process.env[name]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return fallback;
}

function relaxedLimitEnv() {
  const raw = process.env.NEXMARKETS_AGENT_TRADING_RELAXED_DAILY_EXPOSURE_USDC?.trim().toLowerCase();
  if (raw === "unlimited" || raw === "none") return null;
  return numberEnv(["NEXMARKETS_AGENT_TRADING_RELAXED_DAILY_EXPOSURE_USDC"], 5000);
}

function normalizeWallet(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || !isAddress(trimmed)) return null;
  return getAddress(trimmed);
}

function sameWallet(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function oppositeSide(side: string | null | undefined) {
  return side === "ride" ? "fade" : side === "fade" ? "ride" : null;
}

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysSince(date: Date, now = new Date()) {
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function defaultDailyExposureLimitUsdc() {
  return numberEnv(["NEXMARKETS_AGENT_TRADING_DAILY_EXPOSURE_USDC"], 500);
}

function defaultRelaxationTradeThreshold() {
  return Math.floor(numberEnv(["NEXMARKETS_AGENT_TRADING_RELAXATION_TRADES"], 25));
}

function defaultRelaxationDurationDays() {
  return Math.floor(numberEnv(["NEXMARKETS_AGENT_TRADING_RELAXATION_DAYS"], 30));
}

function fundingLookbackDate() {
  const days = numberEnv(["NEXMARKETS_WASH_TRADE_FUNDING_LOOKBACK_DAYS"], 30);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function walletProfile(db: Database, walletAddress: string): Promise<WalletProfile> {
  const profile = await db.agentProfile.findFirst({
    where: { ownerWallet: { equals: walletAddress, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, publicId: true, displayName: true }
  });
  if (profile) {
    return { agentProfileId: profile.id, publicId: profile.publicId, displayName: profile.displayName };
  }
  const key = await db.agentApiKey.findFirst({
    where: { walletAddress: { equals: walletAddress, mode: "insensitive" } },
    include: { agentProfile: { select: { id: true, publicId: true, displayName: true } } },
    orderBy: { createdAt: "asc" }
  });
  return {
    agentProfileId: key?.agentProfile?.id ?? key?.agentProfileId ?? null,
    publicId: key?.agentProfile?.publicId ?? key?.publicId ?? null,
    displayName: key?.agentProfile?.displayName ?? key?.identity ?? null
  };
}

async function loadOrCreatePolicy(db: Database, walletAddress: string, input?: { force?: boolean }) {
  const wallet = normalizeWallet(walletAddress);
  if (!wallet) throw new Error("Invalid wallet address.");
  const profile = await walletProfile(db, wallet);
  const existing = await db.agentTradingPolicy.findUnique({ where: { walletAddress: wallet } });
  if (!existing && !profile.agentProfileId && !input?.force) return { policy: null, profile, wallet };
  const today = utcDayStart();
  const policy = existing
    ? await db.agentTradingPolicy.update({
      where: { id: existing.id },
      data: {
        agentProfileId: existing.agentProfileId ?? profile.agentProfileId ?? undefined,
        publicId: existing.publicId ?? profile.publicId ?? undefined,
        ...(existing.limitsResetAt && existing.limitsResetAt.getTime() >= today.getTime()
          ? {}
          : { exposureTodayUsdc: 0, limitsResetAt: today })
      }
    })
    : await db.agentTradingPolicy.create({
      data: {
        walletAddress: wallet,
        agentProfileId: profile.agentProfileId ?? undefined,
        publicId: profile.publicId ?? undefined,
        dailyExposureLimitUsdc: defaultDailyExposureLimitUsdc(),
        relaxedDailyLimitUsdc: relaxedLimitEnv() ?? undefined,
        limitsResetAt: today,
        trustExpiresAt: new Date(today.getTime() + defaultRelaxationDurationDays() * 24 * 60 * 60 * 1000),
        relaxationTradeThreshold: defaultRelaxationTradeThreshold(),
        relaxationDurationDays: defaultRelaxationDurationDays(),
        metadata: jsonInput({ source: "agent_trading_policy_default" })
      }
    });
  return { policy, profile, wallet };
}

function effectiveLimitUsdc(policy: {
  dailyExposureLimitUsdc: number;
  relaxedDailyLimitUsdc: number | null;
  relaxationTradeThreshold: number;
  relaxationDurationDays: number;
  cleanTradesCount: number;
  relaxedAt: Date | null;
  trustStartedAt: Date;
}) {
  const qualifiesForRelaxation = Boolean(policy.relaxedAt)
    || policy.cleanTradesCount >= policy.relaxationTradeThreshold
    || daysSince(policy.trustStartedAt) >= policy.relaxationDurationDays;
  if (!qualifiesForRelaxation) return policy.dailyExposureLimitUsdc;
  return policy.relaxedDailyLimitUsdc ?? relaxedLimitEnv();
}

export async function assertAgentTradeWithinLimit(input: {
  db: Database;
  walletAddress: string;
  amountUsdc: number;
}) {
  const { policy, wallet } = await loadOrCreatePolicy(input.db, input.walletAddress);
  if (!policy) return { limited: false, walletAddress: wallet, remainingUsdc: null };
  if (policy.tradingDisabled || policy.status !== "ACTIVE") {
    throw new Error("Agent trading is disabled for this wallet.");
  }
  const limit = effectiveLimitUsdc(policy);
  if (limit == null) return { limited: true, walletAddress: wallet, remainingUsdc: null };
  const remaining = Math.max(0, limit - policy.exposureTodayUsdc);
  if (policy.exposureTodayUsdc + input.amountUsdc > limit) {
    throw new Error(`Agent daily trading exposure limit exceeded. Remaining exposure is ${remaining.toFixed(2)} USDC.`);
  }
  return { limited: true, walletAddress: wallet, remainingUsdc: remaining - input.amountUsdc };
}

async function createRiskFlag(db: Database, input: {
  walletAddress: string;
  agentProfileId?: string | null;
  publicId?: string | null;
  marketId?: string | null;
  tradeId?: string | null;
  txHash?: string | null;
  flagType: string;
  severity?: string;
  relatedWalletAddress?: string | null;
  relatedAgentProfileId?: string | null;
  fundingEdgeId?: string | null;
  metadata?: unknown;
}) {
  const wallet = normalizeWallet(input.walletAddress);
  if (!wallet) return null;
  const existing = await db.agentTradingRiskFlag.findFirst({
    where: {
      walletAddress: wallet,
      flagType: input.flagType,
      tradeId: input.tradeId ?? null,
      fundingEdgeId: input.fundingEdgeId ?? null,
      relatedWalletAddress: input.relatedWalletAddress ?? null
    }
  });
  if (existing) return existing;
  return db.agentTradingRiskFlag.create({
    data: {
      walletAddress: wallet,
      agentProfileId: input.agentProfileId ?? undefined,
      publicId: input.publicId ?? undefined,
      marketId: input.marketId ?? undefined,
      tradeId: input.tradeId ?? undefined,
      txHash: input.txHash ?? undefined,
      flagType: input.flagType,
      severity: input.severity ?? "info",
      relatedWalletAddress: input.relatedWalletAddress ?? undefined,
      relatedAgentProfileId: input.relatedAgentProfileId ?? undefined,
      fundingEdgeId: input.fundingEdgeId ?? undefined,
      metadata: jsonInput(input.metadata ?? null)
    }
  });
}

async function recordSelfTradeDisclosure(input: TradeRiskInput, profile: WalletProfile) {
  const creatorWallet = normalizeWallet(input.market.creatorWallet);
  const traderWallet = normalizeWallet(input.trade.walletAddress);
  if (!creatorWallet || !traderWallet || !sameWallet(creatorWallet, traderWallet)) return null;
  const { policy } = await loadOrCreatePolicy(input.db, traderWallet, { force: true });
  const flag = await createRiskFlag(input.db, {
    walletAddress: traderWallet,
    agentProfileId: profile.agentProfileId,
    publicId: profile.publicId,
    marketId: input.market.id,
    tradeId: input.trade.id,
    txHash: input.trade.txHash,
    flagType: "SELF_TRADE_CREATED_MARKET",
    severity: "disclosure",
    metadata: {
      creatorWallet,
      tradeSide: input.trade.side,
      notionalUsdc: input.trade.notionalUsdc,
      source: input.source ?? "native_trade"
    }
  });
  if (policy && flag?.createdAt.getTime() === flag?.updatedAt.getTime()) {
    await input.db.agentTradingPolicy.update({
      where: { id: policy.id },
      data: {
        selfTradeEver: true,
        selfTradeCount: { increment: 1 }
      }
    });
  }
  if (profile.agentProfileId) {
    await input.db.agentReputationEvent.create({
      data: {
        agentProfileId: profile.agentProfileId,
        marketId: input.market.id,
        type: "self_trade_disclosure",
        weight: 0,
        metadata: jsonInput({ tradeId: input.trade.id, txHash: input.trade.txHash, notionalUsdc: input.trade.notionalUsdc })
      }
    }).catch(() => undefined);
    await recordAgentAudit({
      agentProfileId: profile.agentProfileId,
      marketId: input.market.id,
      action: "self_trade_disclosure",
      status: "flagged",
      metadata: { tradeId: input.trade.id, txHash: input.trade.txHash }
    });
  }
  return flag;
}

async function detectWashTradeForTrade(input: TradeRiskInput, profile: WalletProfile) {
  const trader = normalizeWallet(input.trade.walletAddress);
  const opposite = oppositeSide(input.trade.side);
  if (!trader || !opposite) return [];
  const edges = await input.db.walletFundingEdge.findMany({
    where: {
      status: "active",
      observedAt: { gte: fundingLookbackDate() },
      OR: [
        { fundedWallet: { equals: trader, mode: "insensitive" } },
        { funderWallet: { equals: trader, mode: "insensitive" } }
      ]
    },
    orderBy: { observedAt: "desc" },
    take: 20
  });
  const flags = [];
  for (const edge of edges) {
    const related = sameWallet(edge.fundedWallet, trader) ? normalizeWallet(edge.funderWallet) : normalizeWallet(edge.fundedWallet);
    if (!related) continue;
    const oppositeTrade = await input.db.nativeTrade.findFirst({
      where: {
        marketId: input.market.id,
        walletAddress: { equals: related, mode: "insensitive" },
        side: opposite
      },
      orderBy: { createdAt: "desc" }
    });
    if (!oppositeTrade) continue;
    const relatedProfile = await walletProfile(input.db, related);
    const flag = await createRiskFlag(input.db, {
      walletAddress: trader,
      agentProfileId: profile.agentProfileId,
      publicId: profile.publicId,
      marketId: input.market.id,
      tradeId: input.trade.id,
      txHash: input.trade.txHash,
      flagType: "WASH_TRADE_HEURISTIC",
      severity: "review",
      relatedWalletAddress: related,
      relatedAgentProfileId: relatedProfile.agentProfileId,
      fundingEdgeId: edge.id,
      metadata: {
        heuristic: "funding_edge_then_opposite_side_same_market",
        fundingTxHash: edge.txHash,
        fundingDirection: sameWallet(edge.fundedWallet, trader) ? "related_funded_trader" : "trader_funded_related",
        relatedTradeId: oppositeTrade.id,
        relatedTradeSide: oppositeTrade.side,
        currentTradeSide: input.trade.side
      }
    });
    await createRiskFlag(input.db, {
      walletAddress: related,
      agentProfileId: relatedProfile.agentProfileId,
      publicId: relatedProfile.publicId,
      marketId: input.market.id,
      tradeId: oppositeTrade.id,
      txHash: oppositeTrade.txHash,
      flagType: "WASH_TRADE_HEURISTIC",
      severity: "review",
      relatedWalletAddress: trader,
      relatedAgentProfileId: profile.agentProfileId,
      fundingEdgeId: edge.id,
      metadata: {
        heuristic: "funding_edge_then_opposite_side_same_market",
        fundingTxHash: edge.txHash,
        relatedTradeId: input.trade.id,
        relatedTradeSide: input.trade.side,
        currentTradeSide: oppositeTrade.side
      }
    });
    for (const wallet of [trader, related]) {
      const { policy } = await loadOrCreatePolicy(input.db, wallet, { force: true });
      if (policy) {
        await input.db.agentTradingPolicy.update({
          where: { id: policy.id },
          data: { washTradeFlagCount: { increment: 1 } }
        });
      }
    }
    flags.push(flag);
  }
  return flags;
}

export async function recordAgentNativeTradeRisk(input: TradeRiskInput) {
  const wallet = normalizeWallet(input.trade.walletAddress);
  if (!wallet) throw new Error("Invalid trade wallet.");
  const profile = await walletProfile(input.db, wallet);
  const { policy } = await loadOrCreatePolicy(input.db, wallet, { force: Boolean(profile.agentProfileId) });
  if (policy) {
    const exposureDate = utcDayStart(input.trade.createdAt ?? new Date());
    await input.db.agentTradingExposureLedger.create({
      data: {
        walletAddress: wallet,
        agentProfileId: profile.agentProfileId ?? undefined,
        marketId: input.market.id,
        tradeId: input.trade.id,
        side: input.trade.side,
        amountUsdc: input.trade.notionalUsdc,
        exposureDate,
        txHash: input.trade.txHash,
        metadata: jsonInput({ source: input.source ?? "native_trade" })
      }
    });
    await input.db.agentTradingPolicy.update({
      where: { id: policy.id },
      data: {
        exposureTodayUsdc: { increment: input.trade.notionalUsdc },
        cleanTradesCount: { increment: 1 },
        relaxedAt: policy.relaxedAt
          ?? (policy.cleanTradesCount + 1 >= policy.relaxationTradeThreshold ? new Date() : undefined)
      }
    });
  }
  const [selfTradeFlag, washTradeFlags] = await Promise.all([
    recordSelfTradeDisclosure(input, profile),
    detectWashTradeForTrade(input, profile)
  ]);
  return {
    policyRecorded: Boolean(policy),
    selfTradeFlag,
    washTradeFlags
  };
}

async function detectWashTradeForFundingEdge(db: Database, edge: {
  id: string;
  funderWallet: string;
  fundedWallet: string;
  txHash: string;
}) {
  const funder = normalizeWallet(edge.funderWallet);
  const funded = normalizeWallet(edge.fundedWallet);
  if (!funder || !funded) return [];
  const fundedTrades = await db.nativeTrade.findMany({
    where: { walletAddress: { equals: funded, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  const flags = [];
  for (const trade of fundedTrades) {
    const opposite = oppositeSide(trade.side);
    if (!opposite) continue;
    const relatedTrade = await db.nativeTrade.findFirst({
      where: {
        marketId: trade.marketId,
        walletAddress: { equals: funder, mode: "insensitive" },
        side: opposite
      },
      orderBy: { createdAt: "desc" }
    });
    if (!relatedTrade) continue;
    const market = await db.market.findUnique({
      where: { id: trade.marketId },
      select: { id: true, creatorWallet: true, creatorAgentProfileId: true, creatorAgentPublicId: true }
    });
    if (!market) continue;
    const profile = await walletProfile(db, funded);
    flags.push(...await detectWashTradeForTrade({
      db,
      market,
      trade: {
        id: trade.id,
        walletAddress: funded,
        side: trade.side as NativeSide,
        notionalUsdc: trade.notionalUsdc,
        txHash: trade.txHash,
        createdAt: trade.createdAt
      },
      source: "funding_edge_backfill"
    }, profile));
  }
  return flags;
}

export async function recordWalletFundingEdge(input: FundingEdgeInput) {
  const db = requireDatabase();
  const funderWallet = normalizeWallet(input.funderWallet);
  const fundedWallet = normalizeWallet(input.fundedWallet);
  if (!funderWallet || !fundedWallet) throw new Error("Funding edge requires valid funder and funded wallets.");
  if (sameWallet(funderWallet, fundedWallet)) throw new Error("Funding edge wallets must be different.");
  const observedAt = input.observedAt instanceof Date
    ? input.observedAt
    : input.observedAt
      ? new Date(input.observedAt)
      : new Date();
  const existing = input.logIndex == null
    ? await db.walletFundingEdge.findFirst({ where: { txHash: input.txHash, logIndex: null } })
    : null;
  const data = {
    funderWallet,
    fundedWallet,
    tokenAddress: input.tokenAddress ?? undefined,
    chainId: input.chainId ?? undefined,
    amountUsdc: input.amountUsdc ?? undefined,
    blockNumber: input.blockNumber ?? undefined,
    observedAt,
    source: input.source ?? "onchain_indexer",
    metadata: jsonInput(input.metadata ?? null)
  };
  const edge = existing
    ? await db.walletFundingEdge.update({
      where: { id: existing.id },
      data
    })
    : input.logIndex == null
      ? await db.walletFundingEdge.create({
        data: {
          ...data,
          txHash: input.txHash
        }
      })
      : await db.walletFundingEdge.upsert({
        where: { txHash_logIndex: { txHash: input.txHash, logIndex: input.logIndex } },
        update: data,
        create: {
          ...data,
          txHash: input.txHash,
          logIndex: input.logIndex
        }
      });
  const flags = await detectWashTradeForFundingEdge(db, edge);
  return { edge, flags };
}

export async function updateAgentTradingPolicy(input: {
  walletAddress: string;
  dailyExposureLimitUsdc?: number;
  relaxedDailyLimitUsdc?: number | null;
  relaxationTradeThreshold?: number;
  relaxationDurationDays?: number;
  tradingDisabled?: boolean;
  status?: string;
  metadata?: unknown;
}) {
  const db = requireDatabase();
  const { policy, wallet, profile } = await loadOrCreatePolicy(db, input.walletAddress, { force: true });
  if (!policy) throw new Error("Trading policy could not be created.");
  return db.agentTradingPolicy.update({
    where: { id: policy.id },
    data: {
      agentProfileId: profile.agentProfileId ?? policy.agentProfileId ?? undefined,
      publicId: profile.publicId ?? policy.publicId ?? undefined,
      dailyExposureLimitUsdc: input.dailyExposureLimitUsdc ?? undefined,
      relaxedDailyLimitUsdc: input.relaxedDailyLimitUsdc === undefined ? undefined : input.relaxedDailyLimitUsdc,
      relaxationTradeThreshold: input.relaxationTradeThreshold ?? undefined,
      relaxationDurationDays: input.relaxationDurationDays ?? undefined,
      tradingDisabled: input.tradingDisabled ?? undefined,
      status: input.status ?? undefined,
      metadata: input.metadata === undefined ? undefined : jsonInput(input.metadata),
      walletAddress: wallet
    }
  });
}

export async function getAgentTradingRisk(identifier: string) {
  const db = requireDatabase();
  const wallet = normalizeWallet(identifier);
  const profile = wallet
    ? await walletProfile(db, wallet)
    : null;
  const normalizedId = String(identifier ?? "").trim().replace(/\.id$/i, "").toLowerCase();
  const resolvedProfile = profile?.agentProfileId
    ? await db.agentProfile.findUnique({ where: { id: profile.agentProfileId } })
    : wallet
      ? await db.agentProfile.findFirst({ where: { ownerWallet: { equals: wallet, mode: "insensitive" } } })
      : await db.agentProfile.findFirst({
        where: {
          OR: [
            { id: identifier },
            { publicId: normalizedId }
          ]
        }
      });
  const walletAddress = wallet ?? normalizeWallet(resolvedProfile?.ownerWallet);
  const flagWhere = walletAddress
    ? { walletAddress: { equals: walletAddress, mode: "insensitive" as const } }
    : resolvedProfile
      ? { agentProfileId: resolvedProfile.id }
      : { publicId: normalizedId };
  const exposureWhere = walletAddress
    ? { walletAddress: { equals: walletAddress, mode: "insensitive" as const } }
    : resolvedProfile
      ? { agentProfileId: resolvedProfile.id }
      : { id: "__no_exposure_match__" };
  const [policy, flags, exposure] = await Promise.all([
    db.agentTradingPolicy.findFirst({ where: flagWhere }),
    db.agentTradingRiskFlag.findMany({ where: flagWhere, orderBy: { createdAt: "desc" }, take: 50 }),
    db.agentTradingExposureLedger.aggregate({ where: exposureWhere, _sum: { amountUsdc: true }, _count: { id: true } })
  ]);
  return {
    walletAddress: walletAddress ?? policy?.walletAddress ?? null,
    agentProfileId: resolvedProfile?.id ?? policy?.agentProfileId ?? null,
    publicId: resolvedProfile?.publicId ?? policy?.publicId ?? null,
    policy: policy ? {
      status: policy.status,
      dailyExposureLimitUsdc: policy.dailyExposureLimitUsdc,
      relaxedDailyLimitUsdc: policy.relaxedDailyLimitUsdc,
      exposureTodayUsdc: policy.exposureTodayUsdc,
      limitsResetAt: policy.limitsResetAt?.toISOString() ?? null,
      trustStartedAt: policy.trustStartedAt.toISOString(),
      trustExpiresAt: policy.trustExpiresAt?.toISOString() ?? null,
      relaxationTradeThreshold: policy.relaxationTradeThreshold,
      relaxationDurationDays: policy.relaxationDurationDays,
      cleanTradesCount: policy.cleanTradesCount,
      relaxedAt: policy.relaxedAt?.toISOString() ?? null,
      tradingDisabled: policy.tradingDisabled,
      selfTradeEver: policy.selfTradeEver,
      selfTradeCount: policy.selfTradeCount,
      washTradeFlagCount: policy.washTradeFlagCount
    } : null,
    exposure: {
      trades: exposure._count.id,
      totalUsdc: Number(exposure._sum.amountUsdc ?? 0)
    },
    flags: flags.map((flag) => ({
      id: flag.id,
      flagType: flag.flagType,
      severity: flag.severity,
      status: flag.status,
      marketId: flag.marketId,
      tradeId: flag.tradeId,
      txHash: flag.txHash,
      relatedWalletAddress: flag.relatedWalletAddress,
      fundingEdgeId: flag.fundingEdgeId,
      metadata: flag.metadata,
      createdAt: flag.createdAt.toISOString()
    }))
  };
}
