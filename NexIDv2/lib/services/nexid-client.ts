import type { AuthUser, BoardEntry, BoardKey, DashboardSnapshot, Narrative, OrderType, PolymarketTradingAccount, Position, Receipt, Side } from "@/lib/types/nexid";
import type { NexMarket, RouteDecision, ShapedMarketDraft } from "@/lib/types/nexmarkets";
import type { PublicMarketOrderbook } from "@/lib/types/orderbook";

export type MarketComment = {
  id: string;
  marketId: string;
  authorLabel: string;
  walletAddress: string | null;
  userId: string | null;
  body: string;
  createdAt: string;
};

export type NativeTargetOrder = {
  id: string;
  marketId: string;
  side: Side;
  amountUsdc: number;
  targetPrice: number;
  status: string;
  executorAddress: string | null;
  executorOrderId: string | null;
  createTxHash: string | null;
  executeTxHash: string | null;
  cancelTxHash: string | null;
  expiresAt: string | null;
  createdAt: string;
  walletAddress: string;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the status-derived message.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJson<T>(response);
}

export async function previewOrderApi(input: {
  narrativeId: string;
  side: Side;
  orderType: OrderType;
  amount: number;
  limitPrice: number;
}) {
  const data = await postJson<{
    preview: {
      price: number;
      shares: number;
      maxReturn: number;
      maxLoss: number;
      fee: number;
      polymarketFee?: number;
      nexidFee?: number;
      rewardContribution?: number;
      expiry: string;
      spreadWarning: string | null;
      executionWarning: string | null;
      executionMode: string;
      executionCustody: string;
      executionAvailable: boolean;
      marketQualityScore: number | null;
      marketId: string | null;
      outcomeToken: string | null;
    };
  }>("/api/order/preview", input);
  return data.preview;
}

export async function placeOrderApi(input: {
  narrativeId: string;
  side: Side;
  orderType: OrderType;
  amount: number;
  entryPrice: number;
}) {
  const data = await postJson<{ position: Position }>("/api/order/place", input);
  return data.position;
}

export async function recordUserSignedOrderApi(input: {
  narrativeId: string;
  side: Side;
  orderType: OrderType;
  amount: number;
  entryPrice: number;
  marketId?: string | null;
  outcomeToken: string;
  executionId: string;
  builderCode: string;
  polymarketFunderAddress: string;
  polymarketSignatureType: number;
  fillStatus?: string;
  executionStatus?: "pending" | "live" | "partial_fill" | "filled" | "failed";
  raw?: Record<string, unknown>;
}) {
  const data = await postJson<{ position: Position }>("/api/order/record", input);
  return data.position;
}

export async function createReceiptApi(position: Position, identity: string) {
  const data = await postJson<{ receipt: Receipt }>(`/api/positions/${encodeURIComponent(position.id)}/receipt`, {
    narrativeId: position.narrativeId,
    narrativeName: position.narrativeName,
    side: position.side,
    identity,
    amount: position.amount
  });
  return data.receipt;
}

export async function syncPositionApi(positionId: string) {
  const data = await postJson<{ position: Position }>(`/api/positions/${encodeURIComponent(positionId)}/sync`, {});
  return data.position;
}

export async function syncUserSignedPositionApi(positionId: string, input: {
  executionId: string;
  walletAddress: string;
  outcomeToken?: string | null;
  status: Position["status"];
  fillStatus?: string;
  exitPrice?: number | null;
  settlementPrice?: number | null;
  averagePrice?: number | null;
  filledSize?: number | null;
  originalSize?: number | null;
  settledAt?: string | null;
  raw?: Record<string, unknown>;
}) {
  const data = await postJson<{ position: Position }>(`/api/positions/${encodeURIComponent(positionId)}/user-sync`, input);
  return data.position;
}

export async function checkIdAvailabilityApi(name: string) {
  const response = await fetch(`/api/id/availability?name=${encodeURIComponent(name)}`, { cache: "no-store" });
  return readJson<{
    name: string;
    label: string;
    available: boolean;
    price: number | null;
    priceWei?: string;
    priceUsdFormatted?: string;
    priceEthFormatted?: string;
    isAgentName?: boolean;
  }>(response);
}

export async function reserveIdApi(name: string) {
  const data = await postJson<{
    reservation: {
      name: string;
      expiresInSeconds: number;
      status: string;
    };
  }>("/api/id/reserve", { name });
  return data.reservation;
}

export async function mintIdApi(name: string, payMethod: string, referralCode?: string | null) {
  const data = await postJson<{
    id: {
      name: string;
      label: string;
      status: string;
      payMethod: string;
      checkoutReferenceId?: string;
      price?: number | {
        wei: string;
        eth: string;
        usd: number;
      };
      payment?: {
        mode: "wallet" | "referral" | "edge" | "auto";
        priceUsd: number;
        referralCreditUsd: number;
        edgeRewardCreditUsd: number;
        walletUsd: number;
        creditUsd: number;
        requiresWalletTransaction: boolean;
      };
      txHash?: string;
      primaryOnchainRequired?: boolean;
      primaryOnchainMessage?: string;
      referral?: {
        code: string;
        active: boolean;
        referrer?: string;
        message?: string;
      };
      transaction?: {
        to: `0x${string}`;
        data: `0x${string}`;
        value: string;
        chainId: number;
      } | null;
      message?: string;
    };
  }>("/api/id/mint", { name, payMethod, referralCode });
  return data.id;
}

export async function confirmIdMintApi(name: string, payMethod: string, txHash: string, referralCode?: string | null, checkoutReferenceId?: string | null) {
  const data = await postJson<{
    id: {
      name: string;
      label: string;
      status: string;
      payMethod: string;
      price?: number;
      primaryOnchainRequired?: boolean;
      primaryOnchainMessage?: string;
    };
  }>("/api/id/mint", { name, payMethod, txHash, referralCode, checkoutReferenceId });
  return data.id;
}

export async function fetchNarrativesApi() {
  const response = await fetch("/api/narratives", { cache: "no-store" });
  const data = await readJson<{ narratives: Narrative[] }>(response);
  return data.narratives;
}

export async function fetchBoardsApi() {
  const response = await fetch("/api/boards", { cache: "no-store" });
  const data = await readJson<{ boards: Record<BoardKey, BoardEntry[]> }>(response);
  return data.boards;
}

export async function fetchBoardApi(key: BoardKey) {
  const response = await fetch(`/api/boards/${encodeURIComponent(key)}`, { cache: "no-store" });
  const data = await readJson<{ board: BoardEntry[] }>(response);
  return data.board;
}

export async function fetchDashboardApi() {
  const response = await fetch("/api/dashboard", { cache: "no-store" });
  const data = await readJson<{ dashboard: DashboardSnapshot }>(response);
  return data.dashboard;
}

export async function updateAgentControlsApi(agentId: string, input: {
  action?: "pause" | "resume" | "revoke" | "disable_launching" | "enable_launching";
  dailyLaunchLimit?: number;
  maxBondSpendUsdc?: number;
}) {
  const data = await postJson<{ agent: DashboardSnapshot["agents"][number] }>(`/api/dashboard/agents/${encodeURIComponent(agentId)}`, input);
  return data.agent;
}

export async function claimBalanceApi(input?: { amountUsd?: number; destination?: string | null }) {
  const data = await postJson<{
    claim: {
      referenceId: string;
      amountUsd: number;
      status: string;
      destination: string | null;
      txHash?: string;
      authorization?: {
        distributorAddress: `0x${string}`;
        chainId: number;
        authorization: {
          account: `0x${string}`;
          recipient: `0x${string}`;
          amount: string;
          idNameHash: `0x${string}`;
          authorizationId: `0x${string}`;
          action: number;
          deadline: string;
        };
        signature: `0x${string}`;
      };
    };
  }>("/api/rewards/claim", input ?? {});
  return data.claim;
}

export async function confirmClaimBalanceApi(input: { referenceId: string; txHash: string }) {
  const data = await postJson<{
    claim: {
      referenceId: string;
      amountUsd: number;
      status: string;
      txHash: string;
    };
  }>("/api/rewards/claim", input);
  return data.claim;
}

export async function fetchNexMarketsApi() {
  const response = await fetch("/api/markets", { cache: "no-store" });
  const data = await readJson<{ markets: NexMarket[] }>(response);
  return data.markets;
}

export async function fetchNexMarketApi(id: string) {
  const response = await fetch(`/api/markets/${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await readJson<{ market: NexMarket }>(response);
  return data.market;
}

export async function fetchMarketOrderbookApi(marketId: string) {
  const response = await fetch(`/api/markets/${encodeURIComponent(marketId)}/orderbook`, { cache: "no-store" });
  const data = await readJson<{ orderbook: PublicMarketOrderbook }>(response);
  return data.orderbook;
}

export async function placeMarketOrderbookOrderApi(marketId: string, input: {
  side: Side;
  direction: "bid" | "ask";
  price: number;
  sizeUsdc: number;
  walletAddress: string;
  expiresAt?: string;
}) {
  return postJson<{
    order: {
      id: string;
      marketId: string;
      side: Side;
      direction: "bid" | "ask";
      price: number;
      sizeUsdc: number;
      remainingUsdc: number;
      status: string;
      createdAt: string;
    };
  }>(`/api/markets/${encodeURIComponent(marketId)}/orderbook`, input);
}

export async function fetchNativeTargetOrdersApi(marketId: string) {
  const response = await fetch(`/api/native-markets/${encodeURIComponent(marketId)}/target-orders`, { cache: "no-store" });
  const data = await readJson<{ orders: NativeTargetOrder[] }>(response);
  return data.orders;
}

export async function placeNativeTargetOrderApi(marketId: string, input: {
  side: Side;
  amount: number;
  targetPrice: number;
  walletAddress: string;
  chainId: number;
  executorAddress: string;
  executorOrderId?: string;
  txHash: string;
  expiresAt?: string;
}) {
  const data = await postJson<{ order: NativeTargetOrder }>(`/api/native-markets/${encodeURIComponent(marketId)}/target-orders`, input);
  return data.order;
}

export async function cancelNativeTargetOrderApi(marketId: string, orderId: string, input: { txHash: string }) {
  const data = await postJson<{ order: NativeTargetOrder }>(
    `/api/native-markets/${encodeURIComponent(marketId)}/target-orders/${encodeURIComponent(orderId)}/cancel`,
    input
  );
  return data.order;
}

export async function fetchMarketCommentsApi(marketId: string) {
  const response = await fetch(`/api/markets/${encodeURIComponent(marketId)}/comments`, { cache: "no-store" });
  const data = await readJson<{ comments: MarketComment[] }>(response);
  return data.comments;
}

export async function postMarketCommentApi(marketId: string, body: string) {
  const data = await postJson<{ comment: MarketComment }>(`/api/markets/${encodeURIComponent(marketId)}/comments`, { body });
  return data.comment;
}

export async function shapeMarketApi(input: { rawThesis: string; arenaHint?: "crypto" | "football" | "culture" }) {
  return postJson<{ draftId: string; draft: ShapedMarketDraft }>("/api/shape-market", input);
}

export async function routeCheckApi(input: { draftId?: string; draft: ShapedMarketDraft }) {
  return postJson<{ decision: RouteDecision; market: NexMarket | null }>("/api/route-check", input);
}

export async function fetchTrendingThesesApi(limit = 12) {
  const response = await fetch(`/api/trending-thesis?limit=${encodeURIComponent(String(limit))}`, { cache: "no-store" });
  const data = await readJson<{
    theses: Array<{
      id: string;
      title: string;
      thesis: string;
      arena: string;
      sourceUrl?: string | null;
      fallbackSourceUrl?: string | null;
      score: number;
      measurabilityScore: number;
      sourceConfidenceScore: number;
      shaped?: unknown;
      routeDecision?: unknown;
      createdAt: string;
    }>;
  }>(response);
  return data.theses;
}

export async function fetchNotificationsApi() {
  const response = await fetch("/api/notifications", { cache: "no-store" });
  const data = await readJson<{
    notifications: Array<{
      id: string;
      type: string;
      status: string;
      title: string;
      body: string;
      marketId?: string | null;
      createdAt: string;
      readAt?: string | null;
    }>;
  }>(response);
  return data.notifications;
}

export async function markNotificationReadApi(id: string) {
  const data = await postJson<{ notification: { id: string; status: string; readAt?: string | null } }>(
    `/api/notifications/${encodeURIComponent(id)}/read`,
    {}
  );
  return data.notification;
}

export async function saveNotificationPreferencesApi(input: {
  walletAddress?: string;
  email?: string;
  telegramHandle?: string;
  telegramChatId?: string;
  channels?: Array<"dashboard" | "telegram" | "email">;
}) {
  const data = await postJson<{ preference: unknown }>("/api/notifications/preferences", input);
  return data.preference;
}

export async function fetchMarketSourceHealthApi(marketId: string) {
  const response = await fetch(`/api/source-health/${encodeURIComponent(marketId)}`, { cache: "no-store" });
  const data = await readJson<{ checks: unknown[] }>(response);
  return data.checks;
}

export async function createNativeMarketApi(input: {
  draftId?: string;
  draft?: ShapedMarketDraft;
  walletAddress: string;
  chainId: number;
  rulesHash?: string;
  metadataHash?: string;
  template?: ShapedMarketDraft["template"];
  closeTime?: number;
}) {
  return postJson<{
    market: NexMarket;
    transaction: {
      chainId: number;
      factoryAddress: string | null;
      launchStakeVaultAddress: string | null;
      collateralAddress: string | null;
      feeRouterAddress: string | null;
      resolutionManagerAddress: string | null;
      rulesHash: string;
      metadataHash: string;
      template: ShapedMarketDraft["template"];
      templateId: string;
      closeTime: number;
      primaryDomainName: string;
      authorization: {
        authorizer: string;
        creator: string;
        templateId: string;
        nonce: string;
        deadline: number;
        signature: `0x${string}`;
      } | null;
    };
  }>("/api/native-markets", input);
}

export async function syncNativeMarketEventsApi(chainId: number, fromBlock?: bigint) {
  const params = new URLSearchParams({ chainId: String(chainId) });
  if (fromBlock !== undefined) params.set("fromBlock", fromBlock.toString());
  return postJson<{
    ok: boolean;
    skipped: boolean;
    chainId?: number;
    fromBlock?: string;
    toBlock?: string;
    indexed: number;
    reason?: string;
  }>(`/api/native-markets/sync?${params.toString()}`, {});
}

export async function recordNativeMarketTradeApi(marketId: string, input: {
  side: Side;
  amount: number;
  slippageBps?: number;
  walletAddress: string;
  chainId: number;
  txHash?: string;
}) {
  return postJson<{
    marketId: string;
    chainId: number;
    side: Side;
    amount: number;
    contractAddress: string;
    position?: { id: string; status: string };
    trade?: { id: string; txHash: string; notionalUsdc: number; feeUsdc: number };
    receipt?: { id: string; title: string; proof: string; createdAt: string };
    fee: {
      nativeTradingFeeBps: number;
      creatorBps: number;
      protocolBps: number;
      rewardsBps: number;
      securityBps: number;
    };
  }>(`/api/native-markets/${encodeURIComponent(marketId)}/trade`, input);
}

export async function recordPolymarketRouteOrderApi(marketId: string, input: {
  side: Side;
  orderType: OrderType;
  amount: number;
  entryPrice: number;
  walletAddress: string;
  outcomeToken: string;
  executionId: string;
  builderCode: string;
  polymarketFunderAddress: string;
  polymarketSignatureType: number;
  fillStatus?: string;
  executionStatus?: "pending" | "live" | "partial_fill" | "filled" | "failed";
  raw?: Record<string, unknown>;
}) {
  const data = await postJson<{
    execution: {
      executionId: string;
      status: "pending" | "live";
      fillStatus: string;
      outcomeToken: string;
      builder: string;
    };
    receipt: {
      id: string;
      marketId: string;
      title: string;
      proof: string;
      createdAt: string;
    };
  }>(`/api/markets/${encodeURIComponent(marketId)}/polymarket-orders`, input);
  return data;
}

export async function fetchPolymarketTradingAccountApi(refresh = false) {
  const query = refresh ? "?refresh=1" : "";
  return readJson<{
    account: PolymarketTradingAccount | null;
    status: "ready" | "unlinked";
    message: string;
  }>(await fetch(`/api/polymarket/account${query}`, { cache: "no-store" }));
}

export async function fetchTelegramAlertConnectionApi() {
  return readJson<{
    connected: boolean;
    telegramHandle: string | null;
    telegramChatId: string | null;
  }>(await fetch("/api/alerts/connect-telegram", { cache: "no-store" }));
}

export async function connectTelegramAlertsApi(input: { telegramHandle?: string; walletAddress?: string } = {}) {
  return postJson<{
    ok: boolean;
    status: string;
    botUsername: string;
    startUrl: string;
    expiresAt: string;
  }>("/api/alerts/connect-telegram", input);
}

export async function fetchAuthUserApi() {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  const data = await readJson<{ user: AuthUser | null }>(response);
  return data.user;
}

export async function requestWalletNonceApi(walletAddress: string) {
  const response = await fetch(`/api/auth/nonce?walletAddress=${encodeURIComponent(walletAddress)}`);
  return readJson<{ walletAddress: string; nonce: string; message: string; expiresAt: string }>(response);
}

export async function verifyWalletApi(input: {
  walletAddress: string;
  message: string;
  signature: string;
  displayName?: string;
  primaryDomainName?: string;
}) {
  const data = await postJson<{ user: AuthUser }>("/api/auth/verify", input);
  return data.user;
}

export async function logoutApi() {
  return postJson<{ ok: boolean }>("/api/auth/logout", {});
}

export async function renderCardApi(input: { type: string; title: string; payload?: Record<string, unknown> }) {
  const data = await postJson<{ card: { id: string; publicUrl: string; format: string } }>("/api/cards/render", input);
  return data.card;
}
