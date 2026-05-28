"use client";

import type { WalletClient } from "viem";
import type { OrderType, PolymarketTradingAccount } from "@/lib/types/nexid";

type ApiCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

type UserExecutionInput = {
  walletClient: WalletClient;
  tradingAccount: PolymarketTradingAccount;
  outcomeToken: string;
  orderType: OrderType;
  amount: number;
  price: number;
};

type UserOrderSyncInput = {
  walletClient: WalletClient;
  tradingAccount: PolymarketTradingAccount;
  executionId: string;
  outcomeToken?: string | null;
};

type ClobOrderResponse = {
  success?: boolean;
  errorMsg?: string;
  orderID?: string;
  orderId?: string;
  id?: string;
  hash?: string;
  status?: string;
  size_matched?: string;
  matched_size?: string;
  original_size?: string;
  size?: string;
  avg_price?: string;
  average_price?: string;
  price?: string;
  settlement_price?: string;
  settlementPrice?: string;
  final_price?: string;
  finalPrice?: string;
};

const POLYGON_CHAIN_ID = 137;

function clobHost() {
  return process.env.NEXT_PUBLIC_POLYMARKET_CLOB_URL || "https://clob.polymarket.com";
}

function publicBuilderCode() {
  const builderCode = process.env.NEXT_PUBLIC_POLYMARKET_BUILDER_CODE?.trim();
  if (!builderCode) {
    throw new Error("NexMarkets builder code is not configured. Set NEXT_PUBLIC_POLYMARKET_BUILDER_CODE before routing Polymarket trades.");
  }
  return builderCode;
}

function accountAddress(walletClient: WalletClient) {
  const address = walletClient.account?.address;
  if (!address) throw new Error("Choose a wallet from RainbowKit before signing the Polymarket order.");
  return address;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function signatureType(account: PolymarketTradingAccount) {
  return Number(account.signatureType);
}

function funderAddress(account: PolymarketTradingAccount) {
  return account.funderAddress;
}

function assertWalletMatchesTradingAccount(walletAddress: string, tradingAccount: PolymarketTradingAccount) {
  if (walletAddress.toLowerCase() !== tradingAccount.ownerWalletAddress.toLowerCase()) {
    throw new Error("Connected wallet does not match the wallet that owns this Polymarket trading account.");
  }
  if (!tradingAccount.funderAddress) {
    throw new Error("Polymarket deposit wallet is not linked for this user.");
  }
}

function storageKey(account: string, tradingAccount: PolymarketTradingAccount) {
  return [
    "nexmarkets",
    "polymarket-clob",
    account.toLowerCase(),
    POLYGON_CHAIN_ID,
    signatureType(tradingAccount),
    funderAddress(tradingAccount).toLowerCase()
  ].join(":");
}

function readStoredCreds(account: string, tradingAccount: PolymarketTradingAccount): ApiCreds | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(account, tradingAccount));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ApiCreds;
    return parsed.key && parsed.secret && parsed.passphrase ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredCreds(account: string, tradingAccount: PolymarketTradingAccount, creds: ApiCreds) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(account, tradingAccount), JSON.stringify(creds));
}

function validCreds(value: unknown): value is ApiCreds {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ApiCreds>;
  return Boolean(record.key && record.secret && record.passphrase);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const data = (error as Error & { data?: unknown }).data;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const detail = record.error ?? record.message ?? record.errorMsg;
      if (typeof detail === "string" && detail.trim()) return `${error.message}: ${detail}`;
    }
    return error.message;
  }
  return String(error);
}

async function createOrDeriveUserApiKey(client: { createApiKey: () => Promise<ApiCreds>; deriveApiKey: () => Promise<ApiCreds> }, account: string, tradingAccount: PolymarketTradingAccount) {
  const failures: string[] = [];
  try {
    const created = await client.createApiKey();
    if (validCreds(created)) {
      writeStoredCreds(account, tradingAccount, created);
      return created;
    }
    failures.push("create returned incomplete credentials");
  } catch (error) {
    failures.push(`create failed: ${errorMessage(error)}`);
  }

  try {
    const derived = await client.deriveApiKey();
    if (validCreds(derived)) {
      writeStoredCreds(account, tradingAccount, derived);
      return derived;
    }
    failures.push("derive returned incomplete credentials");
  } catch (error) {
    failures.push(`derive failed: ${errorMessage(error)}`);
  }

  throw new Error(`Could not create or derive a Polymarket API key for ${account}. ${failures.join(" ")}`);
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function hasPositiveValue(value: unknown) {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0;
}

async function authenticatedUserClobClient(walletClient: WalletClient, tradingAccount: PolymarketTradingAccount) {
  const account = accountAddress(walletClient);
  assertWalletMatchesTradingAccount(account, tradingAccount);
  const clob = await import("@polymarket/clob-client-v2");
  const builderCode = publicBuilderCode();
  const shared = {
    host: clobHost(),
    chain: clob.Chain.POLYGON,
    signer: walletClient,
    signatureType: signatureType(tradingAccount),
    funderAddress: funderAddress(tradingAccount),
    builderConfig: { builderCode },
    useServerTime: true,
    retryOnError: true,
    throwOnError: true
  };
  const baseClient = new clob.ClobClient(shared);
  const cachedCreds = readStoredCreds(account, tradingAccount);
  const creds = cachedCreds ?? await createOrDeriveUserApiKey(baseClient, account, tradingAccount);
  return {
    account,
    tradingAccount,
    clob,
    client: new clob.ClobClient({ ...shared, creds })
  };
}

async function assertUserCanTrade(client: Awaited<ReturnType<typeof authenticatedUserClobClient>>["client"], tradingAccount: PolymarketTradingAccount) {
  const { AssetType } = await import("@polymarket/clob-client-v2");
  await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL }).catch(() => undefined);
  const balance = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  const value = balance as { balance?: unknown; allowances?: Record<string, unknown> };
  const allowances = Object.values(value.allowances ?? {});
  if (!hasPositiveValue(value.balance)) {
    throw new Error(`Your Polymarket deposit wallet ${shortAddress(tradingAccount.funderAddress)} has no available USDC for CLOB trading.`);
  }
  if (allowances.length > 0 && !allowances.some(hasPositiveValue)) {
    throw new Error(`Your Polymarket deposit wallet ${shortAddress(tradingAccount.funderAddress)} has no CLOB USDC allowance. Approve trading for that Polymarket account, then try again.`);
  }
}

function assertMinimumOrderSize(input: { amount: number; price: number }, minOrderSize: unknown) {
  const minSize = numeric(minOrderSize);
  if (!minSize || minSize <= 0) return;
  const shares = input.amount / Math.max(input.price, 0.001);
  if (shares < minSize) {
    throw new Error(`Order is below Polymarket's minimum size for this market. Increase size to at least about $${(minSize * input.price).toFixed(2)}.`);
  }
}

function assertAcceptedOrderResponse(response: ClobOrderResponse) {
  if (response?.success === false || response?.errorMsg) {
    throw new Error(response.errorMsg ? `Polymarket order rejected: ${response.errorMsg}` : "Polymarket order rejected.");
  }
}

function orderId(response: ClobOrderResponse) {
  return response.orderID ?? response.orderId ?? response.id ?? response.hash ?? `user_poly_${Date.now()}`;
}

export async function placeUserSignedPolymarketOrder(input: UserExecutionInput) {
  const { account, clob, client, tradingAccount } = await authenticatedUserClobClient(input.walletClient, input.tradingAccount);
  const builderCode = publicBuilderCode();
  await assertUserCanTrade(client, tradingAccount);
  const orderBook = await client.getOrderBook(input.outcomeToken);
  const options = {
    tickSize: orderBook.tick_size as "0.1" | "0.01" | "0.001" | "0.0001",
    negRisk: orderBook.neg_risk
  };
  assertMinimumOrderSize(input, orderBook.min_order_size);

  const response = input.orderType === "market"
    ? await client.createAndPostMarketOrder(
        {
          tokenID: input.outcomeToken,
          amount: input.amount,
          side: clob.Side.BUY,
          orderType: clob.OrderType.FAK,
          builderCode
        },
        options,
        clob.OrderType.FAK
      )
    : await client.createAndPostOrder(
        {
          tokenID: input.outcomeToken,
          price: input.price,
          size: input.amount / Math.max(input.price, 0.001),
          side: clob.Side.BUY,
          builderCode
        },
        options,
        clob.OrderType.GTC
      );

  assertAcceptedOrderResponse(response);
  const raw = response as ClobOrderResponse;
  const status = raw.status === "matched" || raw.success === true ? "live" : "pending";
  return {
    walletAddress: account,
    polymarketFunderAddress: tradingAccount.funderAddress,
    polymarketSignatureType: tradingAccount.signatureType,
    executionId: String(orderId(raw)),
    executionStatus: status as "pending" | "live",
    fillStatus: raw.status ? String(raw.status) : input.orderType === "market" ? "submitted" : "resting",
    outcomeToken: input.outcomeToken,
    builderCode,
    raw: raw as Record<string, unknown>
  };
}

export async function syncUserSignedPolymarketOrder(input: UserOrderSyncInput) {
  const { account, client, tradingAccount } = await authenticatedUserClobClient(input.walletClient, input.tradingAccount);
  const order = await client.getOrder(input.executionId);
  const raw = order as ClobOrderResponse;
  const statusText = String(raw.status ?? "").toLowerCase();
  const sizeMatched = Number(raw.size_matched ?? raw.matched_size ?? 0);
  const originalSize = Number(raw.original_size ?? raw.size ?? 0);
  const settlementPrice = numeric(raw.settlement_price ?? raw.settlementPrice ?? raw.final_price ?? raw.finalPrice);
  const closed = statusText.includes("closed") || statusText.includes("complete");
  const resolved = statusText.includes("resolve") || statusText.includes("settle") || statusText.includes("redeem");
  const status =
    resolved
      ? "resolved"
      : closed
        ? "closed"
        : statusText.includes("cancel") || statusText.includes("fail")
          ? "failed"
          : originalSize > 0 && sizeMatched > 0 && sizeMatched < originalSize
            ? "partial_fill"
            : statusText.includes("match") || statusText.includes("fill")
              ? "filled"
              : "live";
  const exitPrice = resolved || closed
    ? settlementPrice ?? numeric(raw.avg_price ?? raw.average_price ?? raw.price)
    : null;
  return {
    walletAddress: account,
    polymarketFunderAddress: tradingAccount.funderAddress,
    polymarketSignatureType: tradingAccount.signatureType,
    executionId: input.executionId,
    outcomeToken: input.outcomeToken,
    status: status as "live" | "partial_fill" | "filled" | "failed" | "closed" | "resolved",
    fillStatus: statusText || "open",
    exitPrice,
    settlementPrice,
    raw: raw as Record<string, unknown>
  };
}
