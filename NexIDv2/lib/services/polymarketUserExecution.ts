"use client";

import type { WalletClient } from "viem";
import type { OrderType as NexOrderType } from "@/lib/types/nexid";

type UserExecutionInput = {
  walletClient: WalletClient;
  outcomeToken: string;
  orderType: NexOrderType;
  amount: number;
  price: number;
};

type UserExecutionResult = {
  executionId: string;
  fillStatus: string;
  executionStatus: "pending" | "live" | "partial_fill" | "filled" | "failed";
  raw: Record<string, unknown>;
};

type UserOrderSyncInput = {
  walletClient: WalletClient;
  executionId: string;
  outcomeToken?: string | null;
};

type UserOrderSyncStatus = "pending" | "live" | "partial_fill" | "filled" | "closed" | "resolved" | "failed";

type UserOrderSyncResult = {
  executionId: string;
  walletAddress: string;
  outcomeToken: string | null;
  status: UserOrderSyncStatus;
  fillStatus: string;
  exitPrice: number | null;
  settlementPrice: number | null;
  averagePrice: number | null;
  filledSize: number | null;
  originalSize: number | null;
  settledAt: string | null;
  raw: Record<string, unknown>;
};

type StoredCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

function clobHost() {
  return process.env.NEXT_PUBLIC_POLYMARKET_CLOB_URL || "https://clob.polymarket.com";
}

function builderCode() {
  return process.env.NEXT_PUBLIC_POLYMARKET_BUILDER_CODE || undefined;
}

function signatureType() {
  const raw = Number(process.env.NEXT_PUBLIC_POLYMARKET_SIGNATURE_TYPE ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function storageKey(address: string, chainId: number) {
  return `nexid:polymarket-clob:${chainId}:${address.toLowerCase()}`;
}

function readStoredCreds(address: string, chainId: number): StoredCreds | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(address, chainId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCreds>;
    return parsed.key && parsed.secret && parsed.passphrase
      ? { key: parsed.key, secret: parsed.secret, passphrase: parsed.passphrase }
      : null;
  } catch {
    return null;
  }
}

function writeStoredCreds(address: string, chainId: number, creds: StoredCreds) {
  window.sessionStorage.setItem(storageKey(address, chainId), JSON.stringify(creds));
}

function mapStatus(response: Record<string, unknown>): UserExecutionResult["executionStatus"] {
  const status = String(response.status ?? response.state ?? "").toLowerCase();
  if (status.includes("fail") || status.includes("cancel") || response.success === false) return "failed";
  if (status.includes("partial")) return "partial_fill";
  if (status.includes("match") || status.includes("fill") || response.success === true) return "live";
  return "pending";
}

function responseId(response: Record<string, unknown>) {
  return String(response.orderID ?? response.orderId ?? response.id ?? response.hash ?? `poly_user_${Date.now()}`);
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function tokenFromRecord(record: Record<string, unknown> | null) {
  if (!record) return null;
  const value = record.asset_id ?? record.assetId ?? record.token_id ?? record.tokenID;
  return typeof value === "string" && value ? value : null;
}

function textStatus(record: Record<string, unknown> | null) {
  return String(record?.status ?? record?.state ?? "").toLowerCase();
}

function weightedAveragePrice(trades: Record<string, unknown>[]) {
  const weighted = trades.reduce<{ size: number; value: number }>(
    (total, trade) => {
      const size = numeric(trade.size ?? trade.matched_amount ?? trade.matchedAmount) ?? 0;
      const price = numeric(trade.price ?? trade.avg_price ?? trade.average_price) ?? 0;
      return { size: total.size + size, value: total.value + size * price };
    },
    { size: 0, value: 0 }
  );
  return weighted.size > 0 ? weighted.value / weighted.size : null;
}

function orderMatchesTrade(trade: Record<string, unknown>, orderId: string) {
  if (String(trade.taker_order_id ?? trade.takerOrderId ?? "") === orderId) return true;
  const makerOrders = Array.isArray(trade.maker_orders) ? trade.maker_orders : [];
  return makerOrders.some((order) => {
    if (!order || typeof order !== "object") return false;
    const record = order as Record<string, unknown>;
    return String(record.order_id ?? record.orderId ?? record.id ?? "") === orderId;
  });
}

function mapSyncedStatus(order: Record<string, unknown> | null, trades: Record<string, unknown>[]): UserOrderSyncStatus {
  const statusText = [textStatus(order), ...trades.map(textStatus)].join(" ");
  const sizeMatched = numeric(order?.size_matched ?? order?.matched_size) ?? trades.reduce((sum, trade) => sum + (numeric(trade.size) ?? 0), 0);
  const originalSize = numeric(order?.original_size ?? order?.size);

  if (statusText.includes("resolve") || statusText.includes("settle") || statusText.includes("redeem")) return "resolved";
  if (statusText.includes("fail") || statusText.includes("cancel") || statusText.includes("expired")) return "failed";
  if (statusText.includes("partial")) return "partial_fill";
  if (originalSize && sizeMatched > 0 && sizeMatched < originalSize) return "partial_fill";
  if (statusText.includes("closed") || statusText.includes("complete")) return sizeMatched > 0 || trades.length > 0 ? "filled" : "failed";
  if (statusText.includes("match") || statusText.includes("fill") || statusText.includes("confirmed") || trades.length > 0) return "filled";
  if (statusText.includes("live") || statusText.includes("open") || order) return "live";
  return "pending";
}

async function authenticatedUserClobClient(walletClient: WalletClient) {
  const account = walletClient.account?.address;
  const chainId = walletClient.chain?.id;
  if (!account || !chainId) throw new Error("Choose a wallet on Polygon before using Polymarket.");
  if (chainId !== 137 && chainId !== 80002) throw new Error("Polymarket user-signed orders require Polygon or Polygon Amoy.");

  const clob = await import("@polymarket/clob-client-v2");
  const chain = chainId === 80002 ? clob.Chain.AMOY : clob.Chain.POLYGON;
  const sigType =
    signatureType() === 1 ? clob.SignatureTypeV2.POLY_PROXY :
    signatureType() === 2 ? clob.SignatureTypeV2.POLY_GNOSIS_SAFE :
    signatureType() === 3 ? clob.SignatureTypeV2.POLY_1271 :
    clob.SignatureTypeV2.EOA;
  const funderAddress = sigType === clob.SignatureTypeV2.EOA
    ? undefined
    : process.env.NEXT_PUBLIC_POLYMARKET_FUNDER_ADDRESS || account;
  const baseClient = new clob.ClobClient({
    host: clobHost(),
    chain,
    signer: walletClient,
    signatureType: sigType,
    funderAddress,
    useServerTime: true,
    throwOnError: true
  });
  const cachedCreds = readStoredCreds(account, chainId);
  const creds = cachedCreds ?? await baseClient.createOrDeriveApiKey();
  if (!cachedCreds) writeStoredCreds(account, chainId, creds);

  const client = new clob.ClobClient({
    host: clobHost(),
    chain,
    signer: walletClient,
    creds,
    signatureType: sigType,
    funderAddress,
    builderConfig: builderCode() ? { builderCode: builderCode()! } : undefined,
    useServerTime: true,
    throwOnError: true
  });
  return { account, client, clob };
}

export async function placeUserSignedPolymarketOrder(input: UserExecutionInput): Promise<UserExecutionResult> {
  const { client, clob } = await authenticatedUserClobClient(input.walletClient);

  const response = input.orderType === "market"
    ? await client.createAndPostMarketOrder(
        {
          tokenID: input.outcomeToken,
          amount: input.amount,
          side: clob.Side.BUY,
          price: input.price,
          orderType: clob.OrderType.FAK,
          builderCode: builderCode()
        },
        { tickSize: "0.01" },
        clob.OrderType.FAK
      )
    : await client.createAndPostOrder(
        {
          tokenID: input.outcomeToken,
          price: input.price,
          size: input.amount / Math.max(input.price, 0.01),
          side: clob.Side.BUY,
          builderCode: builderCode()
        },
        { tickSize: "0.01" },
        clob.OrderType.GTC
      );

  const raw: Record<string, unknown> = response && typeof response === "object" ? response as Record<string, unknown> : { response };
  return {
    executionId: responseId(raw),
    fillStatus: String(raw.status ?? "submitted"),
    executionStatus: mapStatus(raw),
    raw
  };
}

export async function syncUserSignedPolymarketOrder(input: UserOrderSyncInput): Promise<UserOrderSyncResult> {
  const { account, client } = await authenticatedUserClobClient(input.walletClient);
  let order: Record<string, unknown> | null = null;
  try {
    const orderResponse = await client.getOrder(input.executionId);
    order = orderResponse && typeof orderResponse === "object" ? orderResponse as unknown as Record<string, unknown> : null;
  } catch {
    order = null;
  }

  const tradeRows = input.outcomeToken
    ? await client.getTrades({ asset_id: input.outcomeToken }, true)
        .then((trades) => Array.isArray(trades) ? trades as unknown[] : [])
        .catch(() => [])
    : [];
  const trades = tradeRows
    .filter((trade): trade is Record<string, unknown> => Boolean(trade && typeof trade === "object"))
    .filter((trade) => orderMatchesTrade(trade, input.executionId));

  if (!order && trades.length === 0) {
    throw new Error("Polymarket did not return this order yet. Try again after the order has indexed.");
  }

  const status = mapSyncedStatus(order, trades);
  const averagePrice = weightedAveragePrice(trades) ?? numeric(order?.avg_price ?? order?.average_price ?? order?.price);
  const settlementTrade = trades.find((trade) => numeric(trade.settlement_price ?? trade.settlementPrice ?? trade.final_price ?? trade.finalPrice) != null);
  const explicitSettlement = numeric(
    order?.settlement_price ??
    order?.settlementPrice ??
    order?.final_price ??
    order?.finalPrice ??
    settlementTrade?.settlement_price ??
    settlementTrade?.settlementPrice ??
    settlementTrade?.final_price ??
    settlementTrade?.finalPrice
  );
  const explicitExit = numeric(order?.exit_price ?? order?.exitPrice ?? order?.cashout_price ?? order?.cashoutPrice);
  const settlementPrice = status === "resolved" ? explicitSettlement : null;
  const exitPrice = status === "resolved" || status === "closed" ? explicitExit ?? settlementPrice : null;
  const filledSize = numeric(order?.size_matched ?? order?.matched_size) ?? trades.reduce((sum, trade) => sum + (numeric(trade.size) ?? 0), 0);
  const originalSize = numeric(order?.original_size ?? order?.size) ?? filledSize;
  const raw = { order, trades: trades.slice(0, 8) };

  return {
    executionId: input.executionId,
    walletAddress: account,
    outcomeToken: tokenFromRecord(order) ?? tokenFromRecord(trades[0] ?? null) ?? input.outcomeToken ?? null,
    status,
    fillStatus: textStatus(order) || textStatus(trades[0] ?? null) || (trades.length ? "filled" : "synced"),
    exitPrice,
    settlementPrice,
    averagePrice,
    filledSize: filledSize || null,
    originalSize: originalSize || null,
    settledAt: settlementPrice != null || exitPrice != null ? new Date().toISOString() : null,
    raw
  };
}
