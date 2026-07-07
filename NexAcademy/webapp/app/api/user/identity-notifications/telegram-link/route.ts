import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth";
import { createTelegramLinkToken } from "@/lib/services/telegram-notification.service";

const requestSchema = z.object({
  profileId: z.string().optional(),
  domainName: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+(?:\.id)?$/i, "Domain must be a valid .id name")
    .optional(),
});

function normalizeDomainName(domainName?: string) {
  if (!domainName) return null;
  const normalized = domainName.trim().toLowerCase();
  return normalized.endsWith(".id") ? normalized : `${normalized}.id`;
}

function buildTelegramDeepLink(token: string) {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (!username) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(token)}`;
}

export async function POST(request: NextRequest) {
  const auth = verifyAuth(request);
  if (!auth) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid Telegram link request" },
      { status: 400 },
    );
  }

  const domainName = normalizeDomainName(parsed.data.domainName);
  const primaryWalletAddress = auth.walletAddress.toLowerCase();

  const existingProfile = parsed.data.profileId
    ? await prisma.identityNotificationProfile.findFirst({
        where: {
          id: parsed.data.profileId,
          userId: auth.userId,
        },
      })
    : await prisma.identityNotificationProfile.findFirst({
        where: domainName
          ? { userId: auth.userId, domainName }
          : { userId: auth.userId, domainName: null, primaryWalletAddress },
      });

  if (parsed.data.profileId && !existingProfile) {
    return NextResponse.json({ error: "Notification profile not found" }, { status: 404 });
  }

  const profile = existingProfile
    ? await prisma.identityNotificationProfile.update({
        where: { id: existingProfile.id },
        data: {
          primaryWalletAddress,
          linkedWalletAddresses: {
            set: Array.from(
              new Set([
                primaryWalletAddress,
                ...existingProfile.linkedWalletAddresses.map((wallet) => wallet.toLowerCase()),
              ]),
            ),
          },
          isEnabled: true,
        },
      })
    : await prisma.identityNotificationProfile.create({
        data: {
          userId: auth.userId,
          domainName,
          primaryWalletAddress,
          linkedWalletAddresses: [primaryWalletAddress],
          isEnabled: true,
        },
      });

  if (!profile) {
    return NextResponse.json({ error: "Notification profile not found" }, { status: 404 });
  }

  const { token, expiresAt } = createTelegramLinkToken({
    userId: auth.userId,
    profileId: profile.id,
  });

  return NextResponse.json({
    token,
    expiresAt,
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null,
    deepLinkUrl: buildTelegramDeepLink(token),
    profile: {
      id: profile.id,
      domainName: profile.domainName,
      telegramHandle: profile.telegramHandle,
      telegramLinked: Boolean(profile.telegramChatId),
    },
    instructions: "Open the Telegram deep link or send /start <token> to the NexID Telegram bot.",
  });
}
