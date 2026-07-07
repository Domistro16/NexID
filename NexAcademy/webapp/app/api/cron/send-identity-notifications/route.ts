import { NextRequest, NextResponse } from "next/server";
import { runTelegramNotificationDelivery } from "@/lib/services/telegram-notification.service";
import { runRelevanceNotificationDelivery } from "@/lib/services/relevance-ai-notification.service";

export const dynamic = "force-dynamic";

async function handleSendIdentityNotifications(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const batchSize = Math.min(
      100,
      parseInt(url.searchParams.get("batchSize") ?? "25", 10) || 25,
    );
    const results: Record<string, unknown> = {};

    if (process.env.TELEGRAM_BOT_TOKEN) {
      results.telegram = await runTelegramNotificationDelivery(batchSize);
    } else {
      results.telegram = { skipped: true, reason: "TELEGRAM_BOT_TOKEN is not configured" };
    }

    if (process.env.RELEVANCE_AI_API_KEY) {
      results.relevanceAi = await runRelevanceNotificationDelivery(batchSize);
    } else {
      results.relevanceAi = { skipped: true, reason: "RELEVANCE_AI_API_KEY is not configured" };
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("[Cron] send-identity-notifications error:", error);
    return NextResponse.json(
      { error: "Failed to send identity notifications" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleSendIdentityNotifications(request);
}

export async function GET(request: NextRequest) {
  return handleSendIdentityNotifications(request);
}
