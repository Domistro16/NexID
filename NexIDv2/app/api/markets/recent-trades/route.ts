import { NextResponse } from "next/server";
import { listRecentPublicTrades } from "@/lib/services/marketActivityService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(40, Number(url.searchParams.get("limit") || 12)));
  const trades = await listRecentPublicTrades(limit);
  return NextResponse.json({ trades });
}
