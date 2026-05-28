import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json({
    error: `Legacy receipt generation is retired for position ${id}. Market receipts are created automatically by trades, launches and settlements.`
  }, { status: 410 });
}
