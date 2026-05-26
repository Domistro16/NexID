"use server";

import { redirect } from "next/navigation";
import { internalAdminLoginPath, safeInternalReturnPath } from "@/lib/internal/admin-auth";
import { clearInternalAdminCookie, isInternalAdminConfigured, setInternalAdminCookie, verifyInternalAdminToken } from "@/lib/server/internal-admin-auth";

function loginErrorUrl(error: string, returnTo: string) {
  const params = new URLSearchParams({ error, returnTo });
  return `${internalAdminLoginPath}?${params.toString()}`;
}

export async function loginInternalAdmin(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const returnTo = safeInternalReturnPath(String(formData.get("returnTo") ?? ""));

  if (!isInternalAdminConfigured()) {
    redirect(loginErrorUrl("not-configured", returnTo));
  }

  if (!verifyInternalAdminToken(token)) {
    redirect(loginErrorUrl("invalid", returnTo));
  }

  await setInternalAdminCookie(token);
  redirect(returnTo);
}

export async function logoutInternalAdmin() {
  await clearInternalAdminCookie();
  redirect(internalAdminLoginPath);
}
