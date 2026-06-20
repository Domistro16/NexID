import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Exclude the login page itself to prevent infinite redirect
  if (pathname === "/internal/login") {
    return NextResponse.next();
  }

  const expectedToken = (process.env.INTERNAL_ADMIN_TOKEN ?? "").trim();

  // If the admin token is not set in the environment, block access entirely
  if (!expectedToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Internal admin access is not configured." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/internal/login?error=not-configured", request.url));
  }

  // 2. Validate token from Authorization header (for bot/cron calls)
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token === expectedToken) {
      return NextResponse.next();
    }
  }

  // 3. Validate token from cookie (for dashboard navigation)
  const cookieToken = request.cookies.get("internal_admin_token")?.value;
  if (cookieToken === expectedToken) {
    return NextResponse.next();
  }

  // 4. Unauthorized: Redirect to login or return JSON error
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized access: Valid INTERNAL_ADMIN_TOKEN is required." }, { status: 401 });
  }

  const loginUrl = new URL("/internal/login", request.url);
  loginUrl.searchParams.set("returnTo", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/internal/:path*", "/api/internal/:path*"]
};
