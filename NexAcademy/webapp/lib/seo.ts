const DEFAULT_SITE_URL = "http://localhost:3000";
const FALLBACK_IMAGE_PATH = "/nexid_logo.png";

function normalizeSiteUrl(rawUrl?: string | null) {
  if (!rawUrl) {
    return DEFAULT_SITE_URL;
  }

  try {
    const url = new URL(rawUrl);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function getSiteUrl() {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL);
}

export function absoluteUrl(path = "/") {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

export function truncateDescription(value: string, maxLength = 160) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function resolveSeoImage(url?: string | null, fallbackPath = FALLBACK_IMAGE_PATH) {
  if (!url) {
    return absoluteUrl(fallbackPath);
  }

  const lower = url.toLowerCase();
  const isEmbedUrl =
    lower.includes("share.synthesia.io/embeds/videos") ||
    lower.includes("youtube.com/watch") ||
    lower.includes("youtu.be/");

  if (isEmbedUrl) {
    return absoluteUrl(fallbackPath);
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (url.startsWith("/")) {
    return absoluteUrl(url);
  }

  return absoluteUrl(fallbackPath);
}
