import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const sessionCookieName = "nexid_session";
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.AUTH_SECRET || process.env.INTERNAL_ADMIN_TOKEN || "nexid-dev-secret";
}

export function hashToken(token: string) {
  return createHash("sha256").update(`${secret()}:${token}`).digest("hex");
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

export function sessionExpiry() {
  return new Date(Date.now() + sessionTtlMs);
}

export async function setSessionCookie(token: string, expiresAt = sessionExpiry()) {
  const store = await cookies();
  store.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function readSessionToken() {
  const store = await cookies();
  return store.get(sessionCookieName)?.value;
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(sessionCookieName);
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
