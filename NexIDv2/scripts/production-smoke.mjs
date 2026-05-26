const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
const token = process.env.INTERNAL_ADMIN_TOKEN;

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/qa/smoke`, {
  headers: token ? { "x-internal-admin-token": token } : {}
});

const body = await response.json().catch(() => null);
console.log(JSON.stringify(body, null, 2));

if (!response.ok || !body?.ok) {
  process.exitCode = 1;
}
