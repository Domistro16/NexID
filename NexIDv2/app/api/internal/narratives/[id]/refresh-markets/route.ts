import { NextResponse } from "next/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({
    error: `Legacy narrative market refresh is retired for ${id}. Use route-check and market room records.`
  }, { status: 410 });
}
