import { prisma, hasDatabaseUrl } from "@/lib/server/db";
import { renderCardAsset } from "@/lib/services/cardRenderService";
import { checkAvailability } from "@/lib/services/idService";
import { hasS3AssetStore } from "@/lib/services/s3AssetStore";
import { nativeMarketAddresses } from "@/lib/contracts/nexmarkets";
import { nativeResolutionBotReadiness } from "@/lib/services/nativeResolutionBotService";

type Check = {
  name: string;
  ok: boolean;
  detail?: string;
};

async function checkDatabase(): Promise<Check> {
  if (!hasDatabaseUrl() || !prisma) {
    return { name: "database", ok: false, detail: "DATABASE_URL is not configured" };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "database", ok: true };
  } catch (error) {
    return { name: "database", ok: false, detail: error instanceof Error ? error.message : "Database query failed" };
  }
}

async function checkNexDomains(): Promise<Check> {
  if (!process.env.NEXDOMAINS_API_BASE_URL) {
    return { name: "nexdomains", ok: false, detail: "NEXDOMAINS_API_BASE_URL is not configured" };
  }
  try {
    await checkAvailability(`edge-${Date.now().toString(36)}`);
    return { name: "nexdomains", ok: true };
  } catch (error) {
    return { name: "nexdomains", ok: false, detail: error instanceof Error ? error.message : "NexDomains check failed" };
  }
}

async function checkPolymarketPublic(): Promise<Check> {
  try {
    const url = new URL("/ok", process.env.POLYMARKET_CLOB_URL || "https://clob.polymarket.com");
    const response = await fetch(url, { cache: "no-store" });
    return { name: "polymarket_public", ok: response.ok, detail: response.ok ? undefined : `HTTP ${response.status}` };
  } catch (error) {
    return { name: "polymarket_public", ok: false, detail: error instanceof Error ? error.message : "Polymarket public check failed" };
  }
}

async function checkCardStorage(): Promise<Check> {
  try {
    const card = await renderCardAsset({
      type: "points",
      title: "NexID production smoke card",
      payload: { Points: "QA", Status: "S3" }
    });
    return {
      name: "card_storage",
      ok: Boolean(card.publicUrl),
      detail: `${hasS3AssetStore() ? "s3" : "local"}:${card.publicUrl}`
    };
  } catch (error) {
    return { name: "card_storage", ok: false, detail: error instanceof Error ? error.message : "Card storage check failed" };
  }
}

function checkPolymarketBuilder(): Check {
  const routingEnabled = process.env.POLYMARKET_ROUTING_ENABLED !== "false";
  const builderCode = process.env.NEXT_PUBLIC_POLYMARKET_BUILDER_CODE || process.env.POLYMARKET_BUILDER_CODE;
  return {
    name: "polymarket_builder_attribution",
    ok: !routingEnabled || Boolean(builderCode),
    detail: builderCode ? "builder code configured" : "Set NEXT_PUBLIC_POLYMARKET_BUILDER_CODE so routed orders carry NexMarkets attribution"
  };
}

function checkNativeMarketConfig(): Check {
  const enabled = process.env.NATIVE_MARKETS_ENABLED === "true";
  if (!enabled) {
    return { name: "native_markets", ok: true, detail: "disabled" };
  }
  const chainId = Number(process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || process.env.NATIVE_EVENTS_CHAIN_ID || 84532);
  const addresses = nativeMarketAddresses(chainId);
  const missing = [
    !process.env.NATIVE_MARKET_FACTORY_ADDRESS ? "NATIVE_MARKET_FACTORY_ADDRESS" : null,
    !process.env.NATIVE_LAUNCH_STAKE_VAULT_ADDRESS ? "NATIVE_LAUNCH_STAKE_VAULT_ADDRESS" : null,
    !process.env.NATIVE_RESOLUTION_MANAGER_ADDRESS ? "NATIVE_RESOLUTION_MANAGER_ADDRESS" : null,
    !process.env.NATIVE_FEE_ROUTER_ADDRESS ? "NATIVE_FEE_ROUTER_ADDRESS" : null,
    !process.env.NATIVE_LAUNCH_AUTHORIZER_ADDRESS ? "NATIVE_LAUNCH_AUTHORIZER_ADDRESS" : null,
    !process.env.NATIVE_LAUNCH_AUTHORIZER_PRIVATE_KEY ? "NATIVE_LAUNCH_AUTHORIZER_PRIVATE_KEY" : null,
    !process.env.UMA_OPTIMISTIC_ORACLE_V3_ADDRESS ? "UMA_OPTIMISTIC_ORACLE_V3_ADDRESS" : null,
    !addresses.factory ? "NEXT_PUBLIC_NATIVE_MARKET_FACTORY_ADDRESS" : null,
    !addresses.launchStakeVault ? "NEXT_PUBLIC_NATIVE_LAUNCH_STAKE_VAULT_ADDRESS" : null,
    !addresses.collateral ? chainId === 8453 ? "NEXT_PUBLIC_USDC_BASE_MAINNET" : "NEXT_PUBLIC_USDC_BASE_SEPOLIA" : null
  ].filter(Boolean);
  return {
    name: "native_markets",
    ok: missing.length === 0,
    detail: missing.length ? `Missing or unsafe: ${missing.join(", ")}` : `configured for chain ${chainId}`
  };
}

function checkInternalAdminGuard(): Check {
  const token = process.env.INTERNAL_ADMIN_TOKEN?.trim();
  return {
    name: "internal_admin_guard",
    ok: Boolean(token && token.length >= 32),
    detail: token ? "internal routes require an admin token" : "Set INTERNAL_ADMIN_TOKEN to guard /internal and /api/internal"
  };
}

function checkNativeMonitoring(): Check {
  const enabled = process.env.NATIVE_MARKETS_ENABLED === "true";
  const hasMonitor = Boolean(
    process.env.NATIVE_MARKET_ALERT_WEBHOOK_URL?.trim() ||
    process.env.OPENZEPPELIN_DEFENDER_MONITOR_URL?.trim() ||
    process.env.INTERNAL_ALERT_WEBHOOK_URL?.trim()
  );
  return {
    name: "native_market_monitoring",
    ok: !enabled || hasMonitor,
    detail: hasMonitor ? "monitoring endpoint configured" : enabled ? "native markets need monitoring alerts" : "disabled"
  };
}

function checkNativeResolutionBot(): Check {
  const enabled = process.env.NATIVE_MARKETS_ENABLED === "true";
  const readiness = nativeResolutionBotReadiness();
  return {
    name: "native_resolution_bot",
    ok: !enabled || (readiness.enabled && readiness.configured),
    detail: JSON.stringify(readiness)
  };
}

export async function productionSmokeCheck() {
  const checks = await Promise.all([
    checkDatabase(),
    checkNexDomains(),
    checkPolymarketPublic(),
    checkCardStorage()
  ]);
  checks.push(checkPolymarketBuilder(), checkNativeMarketConfig(), checkInternalAdminGuard(), checkNativeMonitoring(), checkNativeResolutionBot());

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}
