export const internalAdminCookieName = "internal_admin_token";
export const internalAdminLoginPath = "/internal/login";
export const internalAdminDefaultPath = "/internal/narrative-mapping";

export function getInternalAdminToken() {
  return process.env.INTERNAL_ADMIN_TOKEN?.trim() ?? "";
}

export function safeInternalReturnPath(value?: string | null) {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/internal") || raw.startsWith(internalAdminLoginPath) || raw.startsWith("//")) {
    return internalAdminDefaultPath;
  }

  return raw;
}
