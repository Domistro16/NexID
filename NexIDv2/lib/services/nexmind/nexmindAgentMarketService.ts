import { upsertWalletUser } from "@/lib/services/authService";
import { createNativeMarketRecord, metadataHashForDraft, rulesHashForDraft, saveMarketDraft } from "@/lib/services/nexmarketsService";
import { composeNexMindMarketDraft } from "@/lib/services/nexmind/nexmindDraftService";
import { routeCheckNexMindMarket } from "@/lib/services/nexmind/nexmindRoutingService";
import { recordAgentAudit, type AuthenticatedAgent } from "@/lib/services/bankr/agentAuthService";
import type { MarketArena, ShapedMarketDraft } from "@/lib/types/nexmarkets";

function defaultChainId() {
  const value = Number(process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || process.env.NATIVE_EVENTS_CHAIN_ID || 84532);
  return Number.isFinite(value) ? value : 84532;
}

async function agentUser(agent: AuthenticatedAgent) {
  if (!agent.walletAddress) throw new Error("Agent market creation requires an agent wallet address.");
  return upsertWalletUser({
    walletAddress: agent.walletAddress,
    displayName: agent.identity ?? agent.name,
    primaryDomainName: agent.identity ?? undefined
  });
}

export async function draftMarketForAgent(input: {
  agent: AuthenticatedAgent;
  rawThesis: string;
  arenaHint?: MarketArena;
}) {
  const draft = await composeNexMindMarketDraft({
    rawThesis: input.rawThesis,
    arenaHint: input.arenaHint,
    agentId: input.agent.id
  });
  const user = input.agent.walletAddress ? await agentUser(input.agent).catch(() => null) : null;
  const saved = await saveMarketDraft(draft, user);
  await recordAgentAudit({
    agentId: input.agent.id,
    action: "draft_market",
    status: "ok",
    metadata: { draftId: saved.id, title: draft.title }
  });
  return { draftId: saved.id, draft };
}

export async function routeMarketForAgent(input: {
  agent: AuthenticatedAgent;
  draft: ShapedMarketDraft;
}) {
  const decision = await routeCheckNexMindMarket({
    draft: input.draft,
    agentId: input.agent.id
  });
  await recordAgentAudit({
    agentId: input.agent.id,
    action: "route_market",
    status: "ok",
    metadata: { recommendedAction: decision.recommendedAction, status: decision.status }
  });
  return decision;
}

export async function createMarketForAgent(input: {
  agent: AuthenticatedAgent;
  draft: ShapedMarketDraft;
  chainId?: number;
  forceCreate?: boolean;
}) {
  const decision = await routeMarketForAgent({ agent: input.agent, draft: input.draft });
  if (!input.forceCreate && decision.recommendedAction === "trade_polymarket") {
    await recordAgentAudit({
      agentId: input.agent.id,
      action: "create_market",
      status: "routed_existing",
      metadata: { decision }
    });
    return {
      action: "trade_existing",
      decision,
      market: null,
      transaction: null
    };
  }
  if (!input.forceCreate && decision.recommendedAction === "join_native") {
    await recordAgentAudit({
      agentId: input.agent.id,
      action: "create_market",
      status: "join_existing",
      metadata: { decision }
    });
    return {
      action: "join_existing",
      decision,
      market: null,
      transaction: null
    };
  }
  if (input.draft.riskStatus !== "allowed") {
    throw new Error(`Agent market cannot be created until the draft is allowed. Missing: ${input.draft.missingFields.join(", ")}`);
  }

  const user = await agentUser(input.agent);
  const chainId = input.chainId ?? defaultChainId();
  const rulesHash = rulesHashForDraft(input.draft);
  const metadataHash = metadataHashForDraft(input.draft);
  const closeTime = input.draft.timeframe?.closeAt ? new Date(input.draft.timeframe.closeAt) : undefined;
  const market = await createNativeMarketRecord({
    draft: input.draft,
    user,
    chainId,
    rulesHash,
    metadataHash,
    closeTime,
    createdByType: "agent",
    creatorAgentId: input.agent.id
  });
  await recordAgentAudit({
    agentId: input.agent.id,
    marketId: market.id,
    action: "create_market",
    status: "ready_to_launch",
    metadata: { rulesHash, metadataHash, decision }
  });
  return {
    action: "create_new_market",
    decision,
    market,
    transaction: {
      chainId,
      rulesHash,
      metadataHash,
      launchStake: {
        stakeUsdc: input.draft.launch.stakeUsdc,
        nonRefundableFeeUsdc: input.draft.launch.nonRefundableFeeUsdc,
        refundableQualityBondUsdc: input.draft.launch.refundableQualityBondUsdc,
        status: "pending"
      }
    }
  };
}
