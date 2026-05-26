import { NextResponse } from "next/server";
import { getOrderBook } from "@/lib/services/polymarketClient";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const orderbook = await getOrderBook(id);
    return NextResponse.json({ orderbook });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Orderbook unavailable" }, { status: 502 });
  }
}
