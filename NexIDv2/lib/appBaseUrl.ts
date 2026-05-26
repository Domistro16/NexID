const LOCAL_APP_BASE_URL = "http://127.0.0.1:3000";

export function normalizeAppBaseUrl(value?: string | null) {
  const raw = value?.trim() || LOCAL_APP_BASE_URL;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

export function getAppBaseUrl() {
  return normalizeAppBaseUrl(process.env.APP_BASE_URL);
}

export function appDisplayBaseUrl(baseUrl: string) {
  return normalizeAppBaseUrl(baseUrl).replace(/^https?:\/\//i, "");
}

export function buildAppUrl(path = "", baseUrl = getAppBaseUrl()) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeAppBaseUrl(baseUrl)}${cleanPath}`;
}

export function buildReferralUrl(code: string, baseUrl = getAppBaseUrl()) {
  return buildAppUrl(`/r/${code}`, baseUrl);
}

export function displayReferralUrl(code: string, baseUrl: string) {
  return `${appDisplayBaseUrl(baseUrl)}/r/${code}`;
}
