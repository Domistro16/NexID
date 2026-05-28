import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "This legacy narrative order endpoint is retired. Use /api/markets/[id]/polymarket-orders for routed market receipts."
  }, { status: 410 });
}
