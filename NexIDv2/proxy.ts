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

  const suppliedToken = request.headers.get("x-internal-admin-token") ?? request.cookies.get(internalAdminCookieName)?.value;
  if (suppliedToken !== token) {
    return isInternalApi ? notFound() : redirectToLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/internal/:path*", "/api/internal/:path*"]
};
