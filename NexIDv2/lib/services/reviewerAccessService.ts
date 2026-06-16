import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getAddress, isAddress } from "viem";
import { requireDatabase } from "@/lib/server/db";
import { getSessionUser } from "@/lib/services/authService";
import type { AuthUser } from "@/lib/types/nexid";

const reviewerSessionCookieNameValue = "nexid_reviewer_session";
const reviewerSessionTtlMs = 7 * 24 * 60 * 60 * 1000;

export type ReviewerAuthUser = AuthUser & {
  reviewerAccessId?: string;
};

type ReviewerSessionPayload = {
  accessId: string;
  rowId: string;
  walletAddress: string;
  expiresAt: number;
};

function secret() {
  return process.env.AUTH_SECRET || process.env.INTERNAL_ADMIN_TOKEN || "nexid-dev-secret";
}

export function normalizeReviewerAccessId(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeReviewerWallet(value: string) {
  if (!isAddress(value)) throw new Error("Invalid reviewer wallet address");
  return getAddress(value);
}

export function generateReviewerAccessKey() {
  return randomBytes(24).toString("base64url");
}

export function hashReviewerAccessKey(accessKey: string, salt = randomBytes(16).toString("hex")) {
  const key = accessKey.trim();
  if (key.length < 12) throw new Error("Reviewer access key must be at least 12 characters.");
  return {
    keySalt: salt,
    keyHash: scryptSync(key, salt, 32).toString("hex")
  };
}

function verifyReviewerAccessKey(input: { accessKey: string; keyHash: string; keySalt: string }) {
  const candidate = scryptSync(input.accessKey.trim(), input.keySalt, 32);
  const expected = Buffer.from(input.keyHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function signPayload(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function createReviewerSessionToken(payload: ReviewerSessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signPayload(encoded)}`;
}

function decodeReviewerSessionToken(token?: string | null): ReviewerSessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = signPayload(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ReviewerSessionPayload;
    if (!payload.rowId || !payload.accessId || !payload.walletAddress || !payload.expiresAt) return null;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function reviewerSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  };
}

export function reviewerSessionCookieName() {
  return reviewerSessionCookieNameValue;
}

async function authUserFromReviewerAccess(input: {
  row: {
    id: string;
    accessId: string;
    reviewerWallet: string;
    reviewerUserId: string | null;
    displayName: string | null;
  };
}) {
  const db = requireDatabase();
  const row = input.row;
  const user = row.reviewerUserId
    ? await db.user.findUnique({ where: { id: row.reviewerUserId } })
    : await db.user.findFirst({ where: { walletAddress: { equals: row.reviewerWallet, mode: "insensitive" } } });

  return {
    id: user?.id ?? `reviewer_access_${row.id}`,
    walletAddress: row.reviewerWallet,
    displayName: row.displayName ?? user?.displayName ?? row.accessId,
    primaryIdName: user?.primaryIdName ?? row.accessId,
    primaryDomainName: user?.primaryIdName ?? row.accessId,
    pointsTotal: user?.pointsTotal ?? 0,
    reviewerAccessId: row.id
  } satisfies ReviewerAuthUser;
}

export async function createOrUpdateReviewerAccess(input: {
  accessId: string;
  accessKey: string;
  reviewerWallet: string;
  displayName?: string | null;
}) {
  const db = requireDatabase();
  const accessId = normalizeReviewerAccessId(input.accessId);
  const reviewerWallet = normalizeReviewerWallet(input.reviewerWallet);
  const { keyHash, keySalt } = hashReviewerAccessKey(input.accessKey);
  const user = await db.user.findFirst({ where: { walletAddress: { equals: reviewerWallet, mode: "insensitive" } } });
  const row = await db.proofFlowReviewerAccess.upsert({
    where: { accessId },
    create: {
      accessId,
      reviewerWallet,
      reviewerUserId: user?.id,
      displayName: input.displayName ?? user?.displayName ?? accessId,
      keyHash,
      keySalt,
      status: "ACTIVE"
    },
    update: {
      reviewerWallet,
      reviewerUserId: user?.id ?? null,
      displayName: input.displayName ?? user?.displayName ?? accessId,
      keyHash,
      keySalt,
      status: "ACTIVE",
      revokedAt: null
    }
  });
  return row;
}

export async function loginReviewerWithAccessKey(input: { accessId: string; accessKey: string }) {
  const db = requireDatabase();
  const accessId = normalizeReviewerAccessId(input.accessId);
  const row = await db.proofFlowReviewerAccess.findUnique({ where: { accessId } });
  if (!row || row.status !== "ACTIVE" || row.revokedAt) {
    throw new Error("Invalid reviewer access id or access key.");
  }
  if (!verifyReviewerAccessKey({ accessKey: input.accessKey, keyHash: row.keyHash, keySalt: row.keySalt })) {
    throw new Error("Invalid reviewer access id or access key.");
  }

  const expiresAt = new Date(Date.now() + reviewerSessionTtlMs);
  const token = createReviewerSessionToken({
    accessId: row.accessId,
    rowId: row.id,
    walletAddress: row.reviewerWallet,
    expiresAt: expiresAt.getTime()
  });

  await db.proofFlowReviewerAccess.update({
    where: { id: row.id },
    data: { lastLoginAt: new Date() }
  });

  return {
    token,
    expiresAt,
    reviewer: await authUserFromReviewerAccess({ row })
  };
}

export async function getReviewerAccessSessionUser() {
  const store = await cookies();
  const payload = decodeReviewerSessionToken(store.get(reviewerSessionCookieNameValue)?.value);
  if (!payload) return null;

  const db = requireDatabase();
  const row = await db.proofFlowReviewerAccess.findUnique({ where: { id: payload.rowId } });
  if (!row || row.accessId !== payload.accessId || row.status !== "ACTIVE" || row.revokedAt) return null;
  if (row.reviewerWallet.toLowerCase() !== payload.walletAddress.toLowerCase()) return null;
  return authUserFromReviewerAccess({ row });
}

export async function getReviewerAuthUser() {
  const sessionUser = await getSessionUser().catch(() => null);
  if (sessionUser) return sessionUser as ReviewerAuthUser;
  return getReviewerAccessSessionUser();
}

export async function requireReviewerAuthUser() {
  const user = await getReviewerAuthUser();
  if (!user) throw new Error("Reviewer authentication required");
  return user;
}
