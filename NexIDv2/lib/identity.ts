export type IdentityLike = {
  walletAddress?: string | null;
  displayName?: string | null;
  primaryIdName?: string | null;
  primaryDomainName?: string | null;
};

const DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const ID_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function shortWalletAddress(value?: string | null) {
  if (!value) return "";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

export function normalizePrimaryDomainName(value?: string | null, appendIdSuffix = false) {
  const clean = value?.trim().toLowerCase();
  if (!clean) return null;
  const withoutScheme = clean.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const normalized = appendIdSuffix && ID_LABEL_PATTERN.test(withoutScheme) ? `${withoutScheme}.id` : withoutScheme;
  return DOMAIN_PATTERN.test(normalized) && normalized.endsWith(".id") ? normalized : null;
}

export function stripIdSuffix(value?: string | null) {
  return value?.trim().replace(/\.id$/i, "") ?? "";
}

export function resolvePrimaryDomainName(user?: IdentityLike | null) {
  if (!user) return null;
  const localIdName = stripIdSuffix(user.primaryIdName);
  if (localIdName) return `${localIdName.toLowerCase()}.id`;
  return normalizePrimaryDomainName(user.primaryDomainName, true) ?? normalizePrimaryDomainName(user.displayName);
}

export function resolveIdentityLabel(user?: IdentityLike | null, fallback?: string) {
  const wallet = shortWalletAddress(user?.walletAddress);
  return resolvePrimaryDomainName(user) ?? fallback ?? (wallet || "tracked");
}
