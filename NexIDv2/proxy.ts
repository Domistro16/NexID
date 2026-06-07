import { NextResponse, type NextRequest } from "next/server";
import { getInternalAdminToken, internalAdminCookieName, internalAdminLoginPath, safeInternalReturnPath } from "@/lib/internal/admin-auth";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = internalAdminLoginPath;
  url.searchParams.set("returnTo", safeInternalReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));
  return NextResponse.redirect(url);
}

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

function suppliedAccessToken(request: NextRequest) {
  return request.headers.get("x-cron-secret")
    ?? request.headers.get("x-internal-admin-token")
    ?? bearerToken(request)
    ?? request.nextUrl.searchParams.get("cronSecret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? request.cookies.get(internalAdminCookieName)?.value;
}

function cronTokenForPathname(pathname: string) {
  if (pathname === "/api/internal/native-resolution/run") return process.env.CRON_SECRET?.trim() || "";
  if (pathname === "/api/internal/nexmind/trending/run") {
    return process.env.TRENDING_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  }
  if (pathname === "/api/internal/source-health/run") {
    return process.env.SOURCE_MONITOR_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  }
  if (pathname === "/api/internal/nexmind/notifications/run") {
    return process.env.NOTIFICATION_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  }
  if (pathname === "/api/internal/proof-flow/reviews/run" || pathname === "/api/internal/proofflow/reviews/run") {
    return process.env.PROOFFLOW_REVIEW_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  }
  if (pathname === "/api/internal/proof-flow/refunds/run" || pathname === "/api/internal/proofflow/refunds/run") {
    return process.env.PROOFFLOW_REFUND_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  }
  if (
    pathname === "/api/internal/proof-flow/receipts/hash/run"
    || pathname === "/api/internal/proof-flow/receipt-hash/run"
    || pathname === "/api/internal/proofflow/receipts/hash/run"
    || pathname === "/api/internal/proofflow/receipt-hash/run"
  ) {
    return process.env.PROOFFLOW_RECEIPT_HASH_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  }
  if (
    pathname === "/api/internal/proof-flow/conflicts"
    || pathname === "/api/internal/proofflow/conflicts"
    || pathname === "/api/internal/proofflow/conflicts/run"
  ) {
    return process.env.PROOFFLOW_REVIEW_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  }
  return "";
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isInternalLogin = pathname === internalAdminLoginPath;
  const isInternalPage = pathname.startsWith("/internal");
  const isInternalApi = pathname.startsWith("/api/internal");
  if (!isInternalPage && !isInternalApi) {
    return NextResponse.next();
  }

  if (isInternalLogin) {
    return NextResponse.next();
  }

  const suppliedToken = suppliedAccessToken(request);
  const cronToken = cronTokenForPathname(pathname);
  if (cronToken && suppliedToken === cronToken) {
    return NextResponse.next();
  }

  const token = getInternalAdminToken();
  if (!token) {
    return isInternalApi ? notFound() : redirectToLogin(request);
  }

  if (suppliedToken !== token) {
    return isInternalApi ? notFound() : redirectToLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/internal/:path*", "/api/internal/:path*"]
};
