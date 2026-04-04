import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PERMISSIONS_POLICY = "microphone=*, camera=*, geolocation=()";

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
}

function setSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
}

function setCorsHeaders(response: NextResponse, origin: string | null) {
  // Only set CORS headers for explicitly allowed origins — never wildcard with credentials
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, X-Api-Version",
  );
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (request.method === "OPTIONS") {
      const response = new NextResponse(null, { status: 204 });
      setSecurityHeaders(response);
      setCorsHeaders(response, request.headers.get("origin"));
      response.headers.set("Access-Control-Max-Age", "86400");

      return response;
    }
  }

  const response = NextResponse.next();
  setSecurityHeaders(response);

  if (request.nextUrl.pathname.startsWith("/api/")) {
    setCorsHeaders(response, request.headers.get("origin"));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
