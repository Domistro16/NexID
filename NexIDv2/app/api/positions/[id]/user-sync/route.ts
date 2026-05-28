import { NextResponse } from "next/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({
    error: `Legacy user-signed position sync is retired for position ${id}. Current routed orders save MarketReceipt rows directly.`
  }, { status: 410 });
}
