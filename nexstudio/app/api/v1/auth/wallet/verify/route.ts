import { verifyMessage } from "viem";
import { z } from "zod";
import { createSession, ensurePersonalWorkspace, getSession, publicUser, setSessionCookie } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { json, problem, requestId, zodProblem } from "@/lib/http";
import { requireTrustedOrigin } from "@/lib/route-auth";
import { consumeRateLimit, requestIpHash } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  challengeId: z.string().uuid(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform((value) => value as `0x${string}`),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/).transform((value) => value as `0x${string}`)
});

export async function POST(request: Request) {
  const id = requestId(request);
  const originError = requireTrustedOrigin(request, id);
  if (originError) return originError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return zodProblem(id, parsed.error);
  const prisma = getPrisma();
  if (!prisma) return problem(id, 503, "DATABASE_REQUIRED", "Authentication unavailable", "A persistent database is required.");
  const ipLimit = await consumeRateLimit(requestIpHash(request), "wallet_verify_ip", 30, 10 * 60_000);
  if (!ipLimit.allowed) return problem(id, 429, "WALLET_RATE_LIMITED", "Too many wallet verifications", `Wait ${ipLimit.retryAfterSeconds} seconds before trying again.`);
  const challenge = await prisma.authChallenge.findUnique({ where: { id: parsed.data.challengeId } });
  const payload = challenge?.payload as { message?: string; chainId?: number } | null;
  if (
    !challenge || challenge.purpose !== "WALLET_VERIFY" || challenge.usedAt ||
    challenge.expiresAt <= new Date() || challenge.identifier !== parsed.data.address.toLowerCase() ||
    !payload?.message || !payload.chainId
  ) {
    return problem(id, 410, "CHALLENGE_EXPIRED", "Wallet challenge expired", "Request a new wallet verification message.");
  }
  const valid = await verifyMessage({
    address: parsed.data.address,
    message: payload.message,
    signature: parsed.data.signature
  }).catch(() => false);
  if (!valid) return problem(id, 401, "INVALID_WALLET_SIGNATURE", "Wallet signature is invalid", "Sign the exact current verification message.");

  const currentSession = await getSession(request);
  const existingWallet = await prisma.wallet.findUnique({
    where: { address_chainId: { address: parsed.data.address.toLowerCase(), chainId: payload.chainId } },
    include: { user: true }
  });
  if (currentSession && existingWallet && existingWallet.userId !== currentSession.userId) {
    return problem(id, 409, "WALLET_ALREADY_LINKED", "Wallet already linked", "This wallet belongs to another NexMarkets account.");
  }

  let user = currentSession?.user ?? existingWallet?.user;
  if (!user) {
    user = await prisma.user.create({
      data: {
        displayName: `${parsed.data.address.slice(0, 6)}…${parsed.data.address.slice(-4)}`,
        settings: {},
        wallets: {
          create: {
            address: parsed.data.address.toLowerCase(),
            chainId: payload.chainId,
            verifiedAt: new Date(),
            isPrimary: true
          }
        }
      }
    });
    await ensurePersonalWorkspace(user.id, user.displayName);
  } else if (!existingWallet) {
    await prisma.wallet.create({
      data: {
        userId: user.id,
        address: parsed.data.address.toLowerCase(),
        chainId: payload.chainId,
        verifiedAt: new Date(),
        isPrimary: true
      }
    });
  }

  await prisma.authChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
  if (currentSession) await prisma.session.update({ where: { id: currentSession.id }, data: { status: "REVOKED", revokedAt: new Date() } });
  const createdSession = await createSession(user.id, request);
  const hydrated = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: {
      wallets: true,
      xAccounts: { where: { revokedAt: null } },
      telegramConnections: { where: { revokedAt: null } },
      workspaceMemberships: { include: { workspace: true } }
    }
  });
  const response = json({ authenticated: true, user: publicUser(hydrated) }, id, { status: 201 });
  setSessionCookie(response, createdSession.token, createdSession.expiresAt, request);
  return response;
}
