import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "This legacy Polymarket order endpoint is retired. Use a market room route so NexMarkets can save a MarketReceipt."
  }, { status: 410 });
}
