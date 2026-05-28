import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    error: "Legacy narratives are retired. Use /api/markets for current NexMarkets rooms."
  }, { status: 410 });
}
