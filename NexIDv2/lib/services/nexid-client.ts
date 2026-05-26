import type { AuthUser, BoardEntry, BoardKey, DashboardSnapshot, Narrative, OrderType, Position, Receipt, Side } from "@/lib/types/nexid";

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

export async function confirmIdMintApi(name: string, payMethod: string, txHash: string, referralCode?: string | null) {
  const data = await postJson<{
    id: {
      name: string;
      label: string;
      status: string;
      payMethod: string;
    };
  }>("/api/id/mint", { name, payMethod, txHash, referralCode });
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
