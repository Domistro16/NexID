export const REFERRAL_STORAGE_KEY = "nexid_referral_code";

export function cleanReferralCode(value?: string | null) {
  const raw = value?.trim().toLowerCase().replace(/\.id$/i, "") ?? "";
  const clean = raw.replace(/[^a-z0-9-]/g, "").slice(0, 24);
  return clean || null;
}

export function referralDisplayName(value?: string | null) {
  const code = cleanReferralCode(value);
  return code ? `${code}.id` : null;
}
