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

  const token = getInternalAdminToken();
  if (!token) {
    return isInternalApi ? notFound() : redirectToLogin(request);
  }

  const suppliedToken = request.headers.get("x-internal-admin-token") ?? bearerToken(request) ?? request.cookies.get(internalAdminCookieName)?.value;
  const cronToken = pathname === "/api/internal/native-resolution/run" ? process.env.CRON_SECRET?.trim() : "";
  if (suppliedToken !== token && (!cronToken || suppliedToken !== cronToken)) {
    return isInternalApi ? notFound() : redirectToLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/internal/:path*", "/api/internal/:path*"]
};
