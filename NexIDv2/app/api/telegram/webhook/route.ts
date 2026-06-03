import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/validation";
import { completeTelegramConnection, sendTelegramBotMessage } from "@/lib/services/nexmind/telegramAlertService";

export const dynamic = "force-dynamic";

function assertTelegramSecret(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) return;
  const supplied = request.headers.get("x-telegram-bot-api-secret-token")?.trim();
  if (supplied !== secret) throw new Error("Invalid Telegram webhook secret.");
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "telegram-webhook" });
}

export async function POST(request: Request) {
  try {
    assertTelegramSecret(request);
    const update = asRecord(await request.json());
    const message = asRecord(update.message ?? update.edited_message);
    const text = stringValue(message.text);
    const chat = asRecord(message.chat);
    const from = asRecord(message.from);
    const chatId = typeof chat.id === "number" || typeof chat.id === "string" ? String(chat.id) : null;
    const token = text?.match(/^\/start\s+([a-f0-9]{48})\b/i)?.[1] ?? null;

    if (!chatId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (text?.startsWith("/start") && !token) {
      const delivery = await sendTelegramBotMessage({
        chatId,
        text: "Open NexMarkets Dashboard > Alerts and press Connect Telegram. That button generates a private start link for this chat."
      });
      return NextResponse.json({ ok: true, status: "missing_connect_token", delivery });
    }

    if (!token) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const username = stringValue(from.username);
    try {
      const result = await completeTelegramConnection({
        token,
        chatId,
        telegramHandle: username ? `@${username}` : null
      });
      const delivery = await sendTelegramBotMessage({
        chatId,
        text: "NexMarkets alerts are connected. You will receive creator source, close, settlement and earnings alerts here."
      });
      return NextResponse.json({ ...result, delivery });
    } catch (error) {
      const delivery = await sendTelegramBotMessage({
        chatId,
        text: "That NexMarkets Telegram link is invalid or expired. Generate a fresh link from Dashboard > Alerts > Connect Telegram."
      });
      return NextResponse.json({
        ok: true,
        status: "connect_failed",
        error: error instanceof Error ? error.message : "Telegram connection failed.",
        delivery
      });
    }
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
