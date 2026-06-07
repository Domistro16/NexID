import { withDatabase } from "@/lib/server/db";
import { booleanFromEnv } from "@/lib/services/bankr/bankrConfig";
import { runBankrAgentPrompt } from "@/lib/services/bankr/bankrAgentService";
import type { AuthUser } from "@/lib/types/nexid";

export type CreatorNotificationInput = {
  userId?: string | null;
  walletAddress?: string | null;
  marketId?: string | null;
  type: "source_issue" | "settlement_reminder" | "market_close_reminder" | "creator_earnings" | "resolution_request" | "agent_market";
  title: string;
  body: string;
  metadata?: unknown;
  channels?: Array<"dashboard" | "telegram" | "email">;
};

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function channelsFrom(value: unknown) {
  if (!Array.isArray(value)) return ["dashboard"];
  const channels = value.filter((item): item is string => typeof item === "string");
  return channels.length ? channels : ["dashboard"];
}

async function preferenceFor(input: { userId?: string | null; walletAddress?: string | null }) {
  return withDatabase(
    async (db) => {
      const where = input.userId
        ? { userId: input.userId }
        : input.walletAddress
          ? { walletAddress: input.walletAddress }
          : undefined;
      if (!where) return null;
      return db.creatorNotificationPreference.findFirst({ where, orderBy: { updatedAt: "desc" } });
    },
    async () => null
  );
}

async function sendTelegram(input: { chatId?: string | null; text: string }) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = input.chatId?.trim();
  if (!token) return { sent: false, reason: "telegram_bot_token_missing" };
  if (!chatId) return { sent: false, reason: "telegram_chat_not_connected" };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: input.text.slice(0, 3500) }),
    cache: "no-store"
  });
  if (!response.ok) return { sent: false, reason: `telegram_http_${response.status}` };
  return { sent: true };
}

async function sendEmail(input: { email?: string | null; subject: string; body: string }) {
  const endpoint = process.env.EMAIL_ALERT_WEBHOOK_URL?.trim();
  const email = input.email?.trim();
  if (!endpoint || !email) return { sent: false, reason: "email_not_configured" };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.EMAIL_PROVIDER_API_KEY ? { Authorization: `Bearer ${process.env.EMAIL_PROVIDER_API_KEY}` } : {})
    },
    body: JSON.stringify({ to: email, subject: input.subject, body: input.body }),
    cache: "no-store"
  });
  if (!response.ok) return { sent: false, reason: `email_http_${response.status}` };
  return { sent: true };
}

async function sendBankrAgentNotification(input: CreatorNotificationInput) {
  if (!booleanFromEnv("BANKR_ENABLE_AGENT_NOTIFICATIONS", false)) {
    return { sent: false, reason: "bankr_agent_notifications_disabled" };
  }
  const prompt = [
    "Send or schedule this NexMarkets creator notification using the connected Bankr automation channels.",
    "Do not trade or move funds.",
    `Recipient wallet: ${input.walletAddress ?? "unknown"}`,
    `Type: ${input.type}`,
    `Title: ${input.title}`,
    `Body: ${input.body}`
  ].join("\n");
  const result = await runBankrAgentPrompt({ prompt });
  return { sent: true, jobId: result.jobId, response: result.response };
}

export async function upsertNotificationPreference(input: {
  user?: AuthUser | null;
  walletAddress?: string | null;
  email?: string | null;
  telegramHandle?: string | null;
  telegramChatId?: string | null;
  channels?: string[];
}) {
  return withDatabase(
    async (db) => {
      const userId = input.user?.id ?? null;
      const walletAddress = input.walletAddress ?? input.user?.walletAddress ?? null;
      const existing = await db.creatorNotificationPreference.findFirst({
        where: userId ? { userId } : walletAddress ? { walletAddress } : { id: "__missing__" }
      });
      const data = {
        userId: userId ?? undefined,
        walletAddress: walletAddress ?? undefined,
        email: input.email ?? undefined,
        telegramHandle: input.telegramHandle ?? undefined,
        telegramChatId: input.telegramChatId ?? undefined,
        channels: jsonInput(input.channels?.length ? input.channels : ["dashboard", "telegram"])
      };
      const row = existing
        ? await db.creatorNotificationPreference.update({ where: { id: existing.id }, data })
        : await db.creatorNotificationPreference.create({ data });
      return {
        id: row.id,
        walletAddress: row.walletAddress,
        email: row.email,
        telegramHandle: row.telegramHandle,
        telegramChatId: row.telegramChatId,
        channels: channelsFrom(row.channels)
      };
    },
    async () => ({
      id: "pref_fallback",
      walletAddress: input.walletAddress ?? input.user?.walletAddress ?? null,
      email: input.email ?? null,
      telegramHandle: input.telegramHandle ?? null,
      telegramChatId: input.telegramChatId ?? null,
      channels: input.channels ?? ["dashboard", "telegram"]
    })
  );
}

export async function createCreatorNotification(input: CreatorNotificationInput) {
  const preference = await preferenceFor(input);
  const requestedChannels = input.channels?.length
    ? input.channels
    : channelsFrom(preference?.channels) as Array<"dashboard" | "telegram" | "email">;
  const deliveries: Record<string, unknown> = {};
  const dashboardEnabled = requestedChannels.includes("dashboard");

  const row = await withDatabase(
    async (db) => {
      if (!dashboardEnabled) return null;
      return db.creatorNotification.create({
        data: {
          userId: input.userId ?? undefined,
          walletAddress: input.walletAddress ?? undefined,
          marketId: input.marketId ?? undefined,
          type: input.type,
          channel: "dashboard",
          title: input.title,
          body: input.body,
          metadata: input.metadata === undefined ? undefined : jsonInput(input.metadata)
        }
      });
    },
    async () => null
  );

  if (requestedChannels.includes("telegram")) {
    deliveries.telegram = await sendTelegram({
      chatId: preference?.telegramChatId,
      text: `${input.title}\n\n${input.body}`
    }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "telegram_failed" }));
  }
  if (requestedChannels.includes("email")) {
    deliveries.email = await sendEmail({
      email: preference?.email,
      subject: input.title,
      body: input.body
    }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "email_failed" }));
  }
  deliveries.bankrAgent = await sendBankrAgentNotification(input)
    .catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "bankr_agent_failed" }));

  return {
    id: row?.id ?? null,
    deliveries
  };
}

export async function listCreatorNotifications(user?: AuthUser | null) {
  if (!user) return [];
  return withDatabase(
    async (db) => {
      const rows = await db.creatorNotification.findMany({
        where: {
          OR: [
            { userId: user.id },
            { walletAddress: user.walletAddress }
          ]
        },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        title: row.title,
        body: row.body,
        marketId: row.marketId,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null
      }));
    },
    async () => []
  );
}

export async function markCreatorNotificationRead(input: { id: string; user?: AuthUser | null }) {
  if (!input.user) throw new Error("Authentication required.");
  return withDatabase(
    async (db) => {
      const row = await db.creatorNotification.findFirst({
        where: {
          id: input.id,
          OR: [
            { userId: input.user?.id },
            { walletAddress: input.user?.walletAddress }
          ]
        }
      });
      if (!row) throw new Error("Notification not found.");
      const updated = await db.creatorNotification.update({
        where: { id: row.id },
        data: { status: "read", readAt: new Date() }
      });
      return { id: updated.id, status: updated.status, readAt: updated.readAt?.toISOString() ?? null };
    },
    async () => ({ id: input.id, status: "read", readAt: new Date().toISOString() })
  );
}
