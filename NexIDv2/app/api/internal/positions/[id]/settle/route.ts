import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json({
    error: `Legacy manual settlement is retired for position ${id}. Use native resolution and UMA settlement for current markets.`
  }, { status: 410 });
}
