import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/services/authService";
import { createMarketOrderbookOrder, getPublicMarketOrderbook } from "@/lib/services/marketOrderbookService";
import { jsonError, marketOrderbookOrderCreateSchema } from "@/lib/server/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const orderbook = await getPublicMarketOrderbook(id);
    if (!orderbook) return NextResponse.json({ error: "Market not found" }, { status: 404 });
    return NextResponse.json({ orderbook });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Orderbook unavailable" }, { status: 502 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSessionUser();
    const body = marketOrderbookOrderCreateSchema.parse(await request.json());
    if (user.walletAddress.toLowerCase() !== body.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Connected wallet does not match signed-in user" }, { status: 403 });
    }
    const order = await createMarketOrderbookOrder({
      marketId: id,
      userId: user.id,
      walletAddress: user.walletAddress,
      side: body.side,
      direction: body.direction,
      price: body.price,
      sizeUsdc: body.sizeUsdc,
      expiresAt: body.expiresAt
    });
    return NextResponse.json({
      order: {
        id: order.id,
        marketId: order.marketId,
        side: order.side,
        direction: order.direction,
        price: order.price,
        sizeUsdc: order.sizeUsdc,
        remainingUsdc: order.remainingUsdc,
        status: order.status,
        createdAt: order.createdAt.toISOString()
      }
    });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
