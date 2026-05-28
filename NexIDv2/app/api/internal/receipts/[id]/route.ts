import { NextResponse } from "next/server";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({
    error: `Legacy receipt review is retired for receipt ${id}. Market receipts are append-only proof records.`
  }, { status: 410 });
}
