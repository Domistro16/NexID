import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth";

const profileSchema = z.object({
  domainName: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+(?:\.id)?$/i, "Domain must be a valid .id name")
    .optional(),
  linkedWalletAddresses: z
    .array(z.string().regex(/^0x[a-fA-F0-9]{40}$/))
    .max(20)
    .optional(),
  telegramHandle: z.string().trim().max(64).optional().nullable(),
  email: z.string().email().optional().nullable(),
  xHandle: z.string().trim().max(64).optional().nullable(),
  relevanceAgentId: z.string().trim().max(128).optional().nullable(),
  relevanceAgentEmail: z.string().email().optional().nullable(),
  relevanceAgentStatus: z
    .enum(["NOT_LINKED", "PENDING_LINK", "LINKED", "DISABLED", "ERROR"])
    .optional(),
  useDefaultRelevanceAgent: z.boolean().optional(),
  mindsAgentId: z.string().trim().max(128).optional().nullable(),
  mindsAgentEmail: z.string().email().optional().nullable(),
  reputationDropThreshold: z.number().int().min(1).max(100).optional(),
  inactivityDaysThreshold: z.number().int().min(7).max(90).optional(),
  isEnabled: z.boolean().optional(),
});

function normalizeDomainName(domainName?: string) {
  if (!domainName) return null;
  const normalized = domainName.trim().toLowerCase();
  return normalized.endsWith(".id") ? normalized : `${normalized}.id`;
}

function normalizeHandle(handle?: string | null) {
  if (!handle) return null;
  const normalized = handle.trim().replace(/^@/, "");
  return normalized.length > 0 ? normalized : null;
}

function normalizeWallets(wallets: string[] | undefined, primaryWallet: string) {
  return Array.from(
    new Set([primaryWallet, ...(wallets ?? [])].map((wallet) => wallet.trim().toLowerCase())),
  );
}

export async function GET(request: NextRequest) {
  const auth = verifyAuth(request);
  if (!auth) return unauthorizedResponse();

  const [profiles, events] = await Promise.all([
    prisma.identityNotificationProfile.findMany({
      where: { userId: auth.userId },
      orderBy: [{ isEnabled: "desc" }, { createdAt: "asc" }],
    }),
    prisma.identityNotificationEvent.findMany({
      where: {
        userId: auth.userId,
        status: { in: ["PENDING", "QUEUED", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  return NextResponse.json({ profiles, events });
}

export async function PUT(request: NextRequest) {
  const auth = verifyAuth(request);
  if (!auth) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid notification profile" },
      { status: 400 },
    );
  }

  const primaryWalletAddress = auth.walletAddress.toLowerCase();
  const domainName = normalizeDomainName(parsed.data.domainName);
  const linkedWalletAddresses = normalizeWallets(
    parsed.data.linkedWalletAddresses,
    primaryWalletAddress,
  );

  const existing = await prisma.identityNotificationProfile.findFirst({
    where: domainName
      ? { userId: auth.userId, domainName }
      : { userId: auth.userId, domainName: null, primaryWalletAddress },
    select: { id: true },
  });

  const relevanceAgentId = parsed.data.relevanceAgentId ?? parsed.data.mindsAgentId;
  const relevanceAgentEmail = parsed.data.relevanceAgentEmail ?? parsed.data.mindsAgentEmail;
  const hasRelevanceLink = Boolean(
    relevanceAgentId ||
    relevanceAgentEmail ||
    parsed.data.useDefaultRelevanceAgent,
  );
  const telegramHandle = normalizeHandle(parsed.data.telegramHandle);
  const xHandle = normalizeHandle(parsed.data.xHandle);

  const data = {
    domainName,
    primaryWalletAddress,
    linkedWalletAddresses,
    telegramHandle,
    email: parsed.data.email?.trim().toLowerCase() ?? null,
    xHandle,
    relevanceAgentId: relevanceAgentId?.trim() || null,
    relevanceAgentEmail: relevanceAgentEmail?.trim().toLowerCase() || null,
    relevanceAgentStatus:
      parsed.data.relevanceAgentStatus ?? (hasRelevanceLink ? ("LINKED" as const) : ("NOT_LINKED" as const)),
    reputationDropThreshold: parsed.data.reputationDropThreshold ?? 10,
    inactivityDaysThreshold: parsed.data.inactivityDaysThreshold ?? 21,
    telegramOptInAt: telegramHandle ? new Date() : null,
    relevanceOptInAt: hasRelevanceLink ? new Date() : null,
    isEnabled: parsed.data.isEnabled ?? true,
  };

  const profile = existing
    ? await prisma.identityNotificationProfile.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.identityNotificationProfile.create({
        data: {
          ...data,
          userId: auth.userId,
        },
      });

  return NextResponse.json({ profile });
}
