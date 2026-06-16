import { NextResponse } from "next/server";
import { reviewerSessionCookieName } from "@/lib/services/reviewerAccessService";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(reviewerSessionCookieName());
  return response;
}
