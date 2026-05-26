import type { ExecutionMode, OrderType, Side } from "@/lib/types/nexid";
import { getExecutionMarket } from "@/lib/services/executionMarketService";

export type PlaceOrderInput = {
  narrativeId: string;
  side: Side;
  orderType: OrderType;
  amount: number;
  entryPrice: number;
  walletAddress?: string;
};

function requiredExecutionEnv() {
  return {
    privateKey: process.env.POLYMARKET_PRIVATE_KEY,
    apiKey: process.env.POLYMARKET_API_KEY,
    secret: process.env.POLYMARKET_API_SECRET,
    passphrase: process.env.POLYMARKET_API_PASSPHRASE,
    funderAddress: process.env.POLYMARKET_FUNDER_ADDRESS,
    signatureType: Number(process.env.POLYMARKET_SIGNATURE_TYPE || 3),
    builderCode: process.env.POLYMARKET_BUILDER_CODE,
    host: process.env.POLYMARKET_CLOB_URL || "https://clob.polymarket.com",
    rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com"
  };
}

function realExecutionConfigured() {
  const env = requiredExecutionEnv();
  return Boolean(env.privateKey && env.apiKey && env.secret && env.passphrase && env.funderAddress);
}

export function configuredExecutionMode(): ExecutionMode {
  const value = process.env.POLYMARKET_EXECUTION_MODE?.trim().toLowerCase();
  if (value === "operator_controlled" || value === "user_signed") return value;
  return "disabled";
}

export function executionPolicy() {
  const mode = configuredExecutionMode();
  const enabled = process.env.ENABLE_REAL_EXECUTION === "true";
  const configured = realExecutionConfigured();
  const operatorExecutable = enabled && mode === "operator_controlled" && configured;
  const userSignedAvailable = enabled && mode === "user_signed";
  const blockingReason =
    !enabled
      ? "Real Polymarket execution is disabled."
      : mode === "disabled"
        ? "Set POLYMARKET_EXECUTION_MODE before enabling trading."
        : mode === "operator_controlled" && !configured
            ? "Operator-controlled Polymarket execution is selected but CLOB credentials are incomplete."
            : null;
  return {
    mode,
    enabled,
    configured,
    executable: operatorExecutable,
    operatorExecutable,
    userSignedAvailable,
    userSafe: userSignedAvailable,
    controlledLaunch: mode === "operator_controlled",
    blockingReason,
    warning: mode === "operator_controlled"
      ? "Controlled-launch mode: orders are routed through the configured operator Polymarket account, not a per-user CLOB credential."
      : null
  };
}

function assertExecutablePolicy() {
  const policy = executionPolicy();
  if (!policy.executable) {
    throw new Error(policy.blockingReason ?? "Polymarket execution is not available.");
  }
  return policy;
}

async function createPolymarketClient() {
  if (!realExecutionConfigured()) {
    throw new Error("Polymarket CLOB credentials are incomplete");
  }
  const [
    { ClobClient, SignatureTypeV2 },
    { createWalletClient, http },
    { privateKeyToAccount }
  ] = await Promise.all([
    import("@polymarket/clob-client-v2"),
    import("viem"),
    import("viem/accounts")
  ]);
  const env = requiredExecutionEnv();
  const account = privateKeyToAccount(env.privateKey as `0x${string}`);
  const signer = createWalletClient({ account, transport: http(env.rpcUrl) });
  return new ClobClient({
    host: env.host,
    chain: 137,
    signer,
    creds: {
      key: env.apiKey!,
      secret: env.secret!,
      passphrase: env.passphrase!
    },
    signatureType: env.signatureType as typeof SignatureTypeV2.POLY_1271,
    funderAddress: env.funderAddress!,
    builderConfig: env.builderCode ? { builderCode: env.builderCode } : undefined,
    useServerTime: true,
    retryOnError: true,
    throwOnError: true
  });
}

export async function placeOrderThroughAdapter(input: PlaceOrderInput) {
  const policy = assertExecutablePolicy();

  const executionMarket = await getExecutionMarket(input.narrativeId, input.side);
  if (!executionMarket?.tokenId) {
    throw new Error("No executable Polymarket token is mapped for this Ride/Fade side");
  }

  const [{ OrderType: ClobOrderType, Side: ClobSide }] = await Promise.all([
    import("@polymarket/clob-client-v2"),
  ]);

  const env = requiredExecutionEnv();
  const client = await createPolymarketClient();

  const response = input.orderType === "market"
    ? await client.createAndPostMarketOrder(
        {
          tokenID: executionMarket.tokenId,
          amount: input.amount,
          side: ClobSide.BUY,
          price: input.entryPrice,
          orderType: ClobOrderType.FAK,
          builderCode: env.builderCode
        },
        undefined,
        ClobOrderType.FAK
      )
    : await client.createAndPostOrder(
        {
          tokenID: executionMarket.tokenId,
          price: input.entryPrice,
          size: input.amount / Math.max(input.entryPrice, 0.01),
          side: ClobSide.BUY,
          builderCode: env.builderCode
        },
        undefined,
        ClobOrderType.GTC
      );

  const orderId = response?.orderID ?? response?.orderId ?? response?.id ?? response?.hash ?? `poly_${Date.now()}`;
  const status = response?.status === "matched" || response?.success === true ? "live" : "pending";
  return {
    executionMode: policy.mode,
    executionId: String(orderId),
    status: status as "pending" | "live",
    fillStatus: response?.status ? String(response.status) : input.orderType === "market" ? "submitted" : "resting",
    outcomeToken: executionMarket.tokenId,
    proof: "Polymarket CLOB",
    builderAttribution: env.builderCode ?? "nexid",
    raw: response
  };
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function getPolymarketOrderStatus(orderId: string) {
  assertExecutablePolicy();
  const client = await createPolymarketClient();
  const order = await client.getOrder(orderId);
  const orderRecord = order as unknown as Record<string, unknown>;
  const statusText = String(orderRecord.status ?? orderRecord.state ?? "").toLowerCase();
  const sizeMatched = Number(orderRecord.size_matched ?? orderRecord.matched_size ?? 0);
  const originalSize = Number(orderRecord.original_size ?? orderRecord.size ?? 0);
  const resolved = statusText.includes("resolve") || statusText.includes("settle") || statusText.includes("redeem");
  const closed = statusText.includes("closed") || statusText.includes("complete");
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
  const settlementPrice = numeric(
    orderRecord.settlement_price ??
    orderRecord.settlementPrice ??
    orderRecord.final_price ??
    orderRecord.finalPrice
  );
  const exitPrice = resolved || closed
    ? settlementPrice ?? numeric(orderRecord.avg_price ?? orderRecord.average_price ?? orderRecord.price)
    : null;
  return {
    fillStatus: statusText || "open",
    status: status as "live" | "partial_fill" | "filled" | "failed" | "closed" | "resolved",
    settlementPrice,
    exitPrice,
    settlementSource: resolved || closed ? "Polymarket CLOB order sync" : null,
    settledAt: resolved || closed ? new Date().toISOString() : null,
    raw: order
  };
}

export function executionReadiness() {
  const env = requiredExecutionEnv();
  const policy = executionPolicy();
  return {
    mode: policy.mode,
    enabled: policy.enabled,
    configured: policy.configured,
    executable: policy.executable,
    operatorExecutable: policy.operatorExecutable,
    userSignedAvailable: policy.userSignedAvailable,
    userSafe: policy.userSafe,
    controlledLaunch: policy.controlledLaunch,
    blockingReason: policy.blockingReason,
    hasPrivateKey: Boolean(env.privateKey),
    hasApiKey: Boolean(env.apiKey),
    hasSecret: Boolean(env.secret),
    hasPassphrase: Boolean(env.passphrase),
    hasFunderAddress: Boolean(env.funderAddress),
    hasBuilderCode: Boolean(env.builderCode),
    host: env.host,
    signatureType: env.signatureType
  };
}
