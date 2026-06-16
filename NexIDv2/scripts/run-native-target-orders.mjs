const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
const token = process.env.INTERNAL_ADMIN_TOKEN || process.env.CRON_SECRET;
const params = new URLSearchParams();

if (process.env.NATIVE_EVENTS_CHAIN_ID) params.set("chainId", process.env.NATIVE_EVENTS_CHAIN_ID);
if (process.env.NATIVE_TARGET_ORDER_MAX_ORDERS) params.set("limit", process.env.NATIVE_TARGET_ORDER_MAX_ORDERS);
if (process.env.NATIVE_TARGET_ORDER_FORCE === "true") params.set("force", "true");

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/native-target-orders/run?${params.toString()}`, {
  headers: token ? { authorization: `Bearer ${token}` } : {}
});

const body = await response.json().catch(() => null);
console.log(JSON.stringify(body, null, 2));

if (!response.ok || !body?.ok) {
  process.exitCode = 1;
}
