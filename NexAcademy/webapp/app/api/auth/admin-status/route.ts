import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";

/**
 * GET /api/auth/admin-status
 * Lightweight admin permission check for client-side conditional UI.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  return NextResponse.json({ isAdmin: true });
}
