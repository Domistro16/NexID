const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
const token = process.env.INTERNAL_ADMIN_TOKEN;

if (!token) {
  console.error("INTERNAL_ADMIN_TOKEN is required.");
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/positions/sync-open`, {
  method: "POST",
  headers: { "x-internal-admin-token": token }
});

const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error(body || `HTTP ${response.status}`);
  process.exit(1);
}

console.log(JSON.stringify(body, null, 2));
