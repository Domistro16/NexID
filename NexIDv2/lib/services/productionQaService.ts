import { prisma, hasDatabaseUrl } from "@/lib/server/db";
import { renderCardAsset } from "@/lib/services/cardRenderService";
import { checkAvailability } from "@/lib/services/idService";
import { executionReadiness } from "@/lib/services/executionAdapter";
import { hasS3AssetStore } from "@/lib/services/s3AssetStore";

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

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}
