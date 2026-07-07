import { NextRequest, NextResponse } from "next/server";
import { linkTelegramChatFromWebhook } from "@/lib/services/telegram-notification.service";

export const dynamic = "force-dynamic";

function isAuthorizedTelegramWebhook(request: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) return true;
  return request.headers.get("x-telegram-bot-api-secret-token") === expectedSecret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedTelegramWebhook(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  if (!update) {
    return NextResponse.json({ error: "Invalid Telegram update" }, { status: 400 });
  }

  try {
    const result = await linkTelegramChatFromWebhook(update);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Telegram] webhook error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
