import { prisma, hasDatabaseUrl } from "@/lib/server/db";
import { renderCardAsset } from "@/lib/services/cardRenderService";
import { checkAvailability } from "@/lib/services/idService";
import { executionReadiness } from "@/lib/services/executionAdapter";
import { hasS3AssetStore } from "@/lib/services/s3AssetStore";
import { nativeMarketAddresses } from "@/lib/contracts/nexmarkets";

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
    !addresses.factory ? "NEXT_PUBLIC_NATIVE_MARKET_FACTORY_ADDRESS" : null,
    !addresses.launchStakeVault ? "NEXT_PUBLIC_NATIVE_LAUNCH_STAKE_VAULT_ADDRESS" : null,
    !addresses.collateral ? chainId === 8453 ? "NEXT_PUBLIC_USDC_BASE_MAINNET" : "NEXT_PUBLIC_USDC_BASE_SEPOLIA" : null,
    chainId === 8453 && process.env.NATIVE_MARKETS_CANARY_MODE !== "true" ? "NATIVE_MARKETS_CANARY_MODE" : null
  ].filter(Boolean);
  return {
    name: "native_markets",
    ok: missing.length === 0,
    detail: missing.length ? `Missing or unsafe: ${missing.join(", ")}` : `configured for chain ${chainId}`
  };
}

function checkMarketComposerSources(): Check {
  if (process.env.MARKET_COMPOSER_ENABLED === "false") {
    return { name: "market_composer_sources", ok: true, detail: "disabled" };
  }
  const missing = [
    !process.env.NEXMARKETS_PRICE_SOURCE_URL ? "NEXMARKETS_PRICE_SOURCE_URL" : null,
    !process.env.NEXMARKETS_SPORTS_SOURCE_URL ? "NEXMARKETS_SPORTS_SOURCE_URL" : null,
    !process.env.NEXMARKETS_ANNOUNCEMENT_SOURCE_URL ? "NEXMARKETS_ANNOUNCEMENT_SOURCE_URL" : null,
    !process.env.NEXMARKETS_CHART_SOURCE_URL ? "NEXMARKETS_CHART_SOURCE_URL" : null
  ].filter(Boolean);
  return {
    name: "market_composer_sources",
    ok: missing.length === 0,
    detail: missing.length ? `Missing source defaults: ${missing.join(", ")}` : "source defaults configured"
  };
}

export async function productionSmokeCheck() {
  const execution = executionReadiness();
  const checks = await Promise.all([
    checkDatabase(),
    checkNexDomains(),
    checkPolymarketPublic(),
    checkCardStorage()
  ]);
  checks.push({
    name: "polymarket_execution",
    ok: !execution.enabled || execution.configured,
    detail: JSON.stringify(execution)
  });
  checks.push(checkPolymarketBuilder(), checkNativeMarketConfig(), checkMarketComposerSources());

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}
