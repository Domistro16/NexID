import { randomBytes } from "crypto";
import { requireDatabase, withDatabase } from "@/lib/server/db";
import { upsertNotificationPreference } from "@/lib/services/nexmind/nexmindNotificationService";
import type { AuthUser } from "@/lib/types/nexid";

function botUsername() {
  return process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || null;
}

function tokenExpiry() {
  return new Date(Date.now() + 15 * 60 * 1000);
}

export async function getTelegramConnectionStatus(user: AuthUser | null) {
  if (!user) return { connected: false, telegramHandle: null, telegramChatId: null };
  return withDatabase(
    async (db) => {
      const preference = await db.creatorNotificationPreference.findFirst({
        where: {
          OR: [
            { userId: user.id },
            { walletAddress: user.walletAddress }
          ]
        },
        orderBy: { updatedAt: "desc" }
      });
      return {
        connected: Boolean(preference?.telegramChatId),
        telegramHandle: preference?.telegramHandle ?? null,
        telegramChatId: preference?.telegramChatId ? `${preference.telegramChatId.slice(0, 3)}...${preference.telegramChatId.slice(-3)}` : null
      };
    },
    async () => ({ connected: false, telegramHandle: null, telegramChatId: null })
  );
}

export async function createTelegramConnection(input: { user: AuthUser; walletAddress?: string | null }) {
  const username = botUsername();
  if (!username) throw new Error("TELEGRAM_BOT_USERNAME is required to create a Telegram connect link.");
  const db = requireDatabase();
  const token = randomBytes(24).toString("hex");
  await db.telegramConnectToken.create({
    data: {
      token,
      userId: input.user.id,
      walletAddress: input.walletAddress ?? input.user.walletAddress,
      expiresAt: tokenExpiry()
    }
  });
  return {
    ok: true,
    status: "pending_start",
    botUsername: username,
    startUrl: `https://t.me/${username}?start=${token}`,
    expiresAt: tokenExpiry().toISOString()
  };
}

export async function completeTelegramConnection(input: {
  token: string;
  chatId: string;
  telegramHandle?: string | null;
}) {
  const db = requireDatabase();
  const row = await db.telegramConnectToken.findUnique({ where: { token: input.token } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new Error("Telegram connect token is invalid or expired.");
  }
  const preference = await upsertNotificationPreference({
    user: row.userId && row.walletAddress ? {
      id: row.userId,
      walletAddress: row.walletAddress,
      pointsTotal: 0
    } : null,
    walletAddress: row.walletAddress,
    telegramHandle: input.telegramHandle,
    telegramChatId: input.chatId,
    channels: ["dashboard", "telegram"]
  });
  await db.telegramConnectToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() }
  });
  await db.analyticsEvent.create({
    data: {
      name: "telegram_alert_connected",
      userId: row.userId,
      metadata: {
        walletAddress: row.walletAddress,
        telegramHandle: input.telegramHandle ?? null,
        telegramChatId: input.chatId
      }
    }
  });
  return { ok: true, status: "connected", preference };
}
