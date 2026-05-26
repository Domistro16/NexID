import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getInternalAdminToken, internalAdminCookieName } from "@/lib/internal/admin-auth";

const adminSessionMaxAge = 12 * 60 * 60;

export function isInternalAdminConfigured() {
  return Boolean(getInternalAdminToken());
}

export function verifyInternalAdminToken(value?: string | null) {
  const expected = getInternalAdminToken();
  if (!expected || !value) return false;

  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function readInternalAdminCookie() {
  const store = await cookies();
  return store.get(internalAdminCookieName)?.value;
}

export async function setInternalAdminCookie(token: string) {
  const store = await cookies();
  store.set(internalAdminCookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: adminSessionMaxAge
  });
}

export async function clearInternalAdminCookie() {
  const store = await cookies();
  store.delete(internalAdminCookieName);
}
