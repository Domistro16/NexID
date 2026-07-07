import crypto from "crypto";
import prisma from "@/lib/prisma";

const DEFAULT_LINK_TOKEN_TTL_MINUTES = 30;
const DEFAULT_DELIVERY_BATCH_SIZE = 25;
const TELEGRAM_API_BASE = "https://api.telegram.org";

type TelegramLinkTokenPayload = {
  userId: string;
  profileId: string;
  exp: number;
};

type TelegramWebhookMessage = {
  message_id?: number;
  text?: string;
  chat?: {
    id?: number | string;
    type?: string;
  };
  from?: {
    id?: number;
    username?: string;
    first_name?: string;
  };
};

type TelegramWebhookUpdate = {
  message?: TelegramWebhookMessage;
};

function getLinkSecret() {
  const secret = process.env.TELEGRAM_LINK_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("TELEGRAM_LINK_SECRET or JWT_SECRET is required");
  return secret;
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signTokenPayload(encodedPayload: string) {
  return crypto
    .createHmac("sha256", getLinkSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function timingSafeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

function normalizeHandle(handle?: string | null) {
  if (!handle) return null;
  const normalized = handle.trim().replace(/^@/, "");
  return normalized.length > 0 ? normalized.toLowerCase() : null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getTelegramBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

export function createTelegramLinkToken(input: {
  userId: string;
  profileId: string;
  ttlMinutes?: number;
}) {
  const ttlMinutes = input.ttlMinutes ?? DEFAULT_LINK_TOKEN_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const payload: TelegramLinkTokenPayload = {
    userId: input.userId,
    profileId: input.profileId,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  const encodedPayload = base64UrlJson(payload);
  const signature = signTokenPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

export function verifyTelegramLinkToken(token: string): TelegramLinkTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signTokenPayload(encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as TelegramLinkTokenPayload;

    if (!payload.userId || !payload.profileId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export function extractTelegramLinkToken(text?: string | null) {
  if (!text) return null;
  const [command, token] = text.trim().split(/\s+/, 2);
  if (!command?.toLowerCase().startsWith("/start")) return null;
  return token ?? null;
}

export async function sendTelegramMessage(input: {
  chatId: string;
  text: string;
  parseMode?: "HTML";
}) {
  const botToken = getTelegramBotToken();
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      parse_mode: input.parseMode,
      disable_web_page_preview: true,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.description ?? `Telegram send failed with ${response.status}`);
  }

  return body;
}

export async function linkTelegramChatFromWebhook(update: TelegramWebhookUpdate) {
  const message = update.message;
  const token = extractTelegramLinkToken(message?.text);
  const chatId = message?.chat?.id ? String(message.chat.id) : null;

  if (!token || !chatId) {
    return { linked: false, reason: "NO_LINK_TOKEN" as const };
  }

  const payload = verifyTelegramLinkToken(token);
  if (!payload) {
    await sendTelegramMessage({
      chatId,
      text: "That NexID link expired or is invalid. Generate a new Telegram link from your NexID notification settings.",
    }).catch((error) => {
      console.error("[Telegram] failed to send invalid-token response:", error);
    });
    return { linked: false, reason: "INVALID_TOKEN" as const };
  }

  const profile = await prisma.identityNotificationProfile.findFirst({
    where: {
      id: payload.profileId,
      userId: payload.userId,
      isEnabled: true,
    },
    select: {
      id: true,
      domainName: true,
      telegramHandle: true,
    },
  });

  if (!profile) {
    return { linked: false, reason: "PROFILE_NOT_FOUND" as const };
  }

  const telegramHandle = normalizeHandle(message?.from?.username) ?? profile.telegramHandle;

  await prisma.$transaction([
    prisma.identityNotificationProfile.update({
      where: { id: profile.id },
      data: {
        telegramChatId: chatId,
        telegramHandle,
        telegramOptInAt: new Date(),
      },
    }),
    prisma.identityNotificationEvent.updateMany({
      where: {
        profileId: profile.id,
        status: "PENDING",
        channel: { in: ["IN_APP", "EMAIL"] },
      },
      data: {
        channel: "TELEGRAM",
        queuedAt: new Date(),
        error: null,
      },
    }),
  ]);

  await sendTelegramMessage({
    chatId,
    text: `Telegram alerts are now linked for ${profile.domainName ?? "your NexID identity"}.`,
  });

  return {
    linked: true,
    profileId: profile.id,
    chatId,
  };
}

function formatNotificationMessage(event: {
  title: string;
  message: string;
  domainName: string | null;
  walletAddress: string;
  previousScore: number | null;
  currentScore: number | null;
}) {
  const scoreLine =
    event.previousScore !== null && event.currentScore !== null
      ? `\n\nScore: ${event.previousScore} -> ${event.currentScore}`
      : event.currentScore !== null
        ? `\n\nScore: ${event.currentScore}`
        : "";
  const identityLine = event.domainName
    ? `\nIdentity: ${escapeHtml(event.domainName)}`
    : `\nWallet: ${escapeHtml(event.walletAddress)}`;

  return `<b>${escapeHtml(event.title)}</b>\n\n${escapeHtml(event.message)}${scoreLine}${identityLine}`;
}

export async function runTelegramNotificationDelivery(batchSize = DEFAULT_DELIVERY_BATCH_SIZE) {
  if (!getTelegramBotToken()) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const events = await prisma.identityNotificationEvent.findMany({
    where: {
      channel: "TELEGRAM",
      status: { in: ["PENDING", "QUEUED", "FAILED"] },
      profile: {
        isEnabled: true,
        telegramChatId: { not: null },
      },
    },
    include: {
      profile: {
        select: {
          telegramChatId: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(batchSize, 1), 100),
  });

  let sent = 0;
  let failed = 0;

  for (const event of events) {
    const chatId = event.profile?.telegramChatId;
    if (!chatId) continue;

    await prisma.identityNotificationEvent.update({
      where: { id: event.id },
      data: {
        status: "QUEUED",
        queuedAt: event.queuedAt ?? new Date(),
        error: null,
      },
    });

    try {
      await sendTelegramMessage({
        chatId,
        text: formatNotificationMessage(event),
        parseMode: "HTML",
      });

      await prisma.identityNotificationEvent.update({
        where: { id: event.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          error: null,
        },
      });
      sent += 1;
    } catch (error: any) {
      await prisma.identityNotificationEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          error: error?.message ?? String(error),
        },
      });
      failed += 1;
    }
  }

  return {
    attempted: events.length,
    sent,
    failed,
  };
}
