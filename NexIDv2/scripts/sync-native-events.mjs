const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
const token = process.env.INTERNAL_ADMIN_TOKEN;
const chainId = process.env.NATIVE_EVENTS_CHAIN_ID;

if (!token) {
  console.error("INTERNAL_ADMIN_TOKEN is required.");
  process.exit(1);
}

const url = new URL("/api/internal/native-events/sync", baseUrl.replace(/\/$/, ""));
if (chainId) url.searchParams.set("chainId", chainId);

const response = await fetch(url, {
  method: "POST",
  headers: { "x-internal-admin-token": token }
});

const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error(body || `HTTP ${response.status}`);
  process.exit(1);
}

console.log(JSON.stringify(body, null, 2));
