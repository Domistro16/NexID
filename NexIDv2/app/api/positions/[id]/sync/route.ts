import { NextResponse } from "next/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({
    error: `Legacy position sync is retired for position ${id}. Current markets sync through native events, routed receipts, and the resolution bot.`
  }, { status: 410 });
}
