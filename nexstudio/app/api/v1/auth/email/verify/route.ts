import { ensurePersonalWorkspace, createSession, getSession, setSessionCookie, sha256 } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { env } from "@/lib/env";
import { problem, requestId } from "@/lib/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = requestId(request);
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token || !/^[A-Za-z0-9_-]{32,}$/.test(token)) return problem(id, 422, "EMAIL_LINK_INVALID", "Email link is invalid", "Request a new NexMarkets access link.");
  const prisma = getPrisma();
  if (!prisma) return problem(id, 503, "DATABASE_REQUIRED", "Email access is unavailable", "A persistent database is required.");
  const challenge = await prisma.authChallenge.findFirst({ where: { purpose: "EMAIL_MAGIC", secretHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!challenge) return problem(id, 410, "EMAIL_LINK_EXPIRED", "Email link expired", "Request a new one-time access link.");
  const existingByEmail = await prisma.user.findUnique({ where: { email: challenge.identifier } });
  if (challenge.userId && existingByEmail && existingByEmail.id !== challenge.userId) return problem(id, 409, "EMAIL_ALREADY_LINKED", "Email already linked", "This address belongs to another NexMarkets account.");

  const payload = challenge.payload as { workspaceName?: string | null } | null;
  const workspaceName = payload?.workspaceName;

  const user = challenge.userId
    ? await prisma.user.update({ where: { id: challenge.userId }, data: { email: challenge.identifier } })
    : existingByEmail || await prisma.user.create({ data: { email: challenge.identifier, displayName: challenge.identifier.split("@")[0], settings: {} } });
  await ensurePersonalWorkspace(user.id, workspaceName || user.displayName);
  const current = await getSession(request);
  await prisma.$transaction([
    prisma.authChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } }),
    ...(current ? [prisma.session.update({ where: { id: current.id }, data: { status: "REVOKED", revokedAt: new Date() } })] : [])
  ]);
  const session = await createSession(user.id, request);
  const response = NextResponse.redirect(`${env.appOrigin}/dashboard?email=verified`, 302);
  setSessionCookie(response, session.token, session.expiresAt, request);
  return response;
}
