import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/services/authService";
import { recordNativeTargetOrderCancellation } from "@/lib/services/nativeTargetOrderService";
import { jsonError, nativeTargetOrderCancelSchema } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

function publicOrder(order: {
  id: string;
  marketId: string;
  side: string;
  amountUsdc: number;
  targetPrice: number;
  status: string;
  executorAddress: string | null;
  executorOrderId: string | null;
  createTxHash: string | null;
  executeTxHash: string | null;
  cancelTxHash: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: order.id,
    marketId: order.marketId,
    side: order.side,
    amountUsdc: order.amountUsdc,
    targetPrice: order.targetPrice,
    status: order.status,
    executorAddress: order.executorAddress,
    executorOrderId: order.executorOrderId,
    createTxHash: order.createTxHash,
    executeTxHash: order.executeTxHash,
    cancelTxHash: order.cancelTxHash,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString()
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  try {
    const { id, orderId } = await params;
    const user = await requireSessionUser();
    const body = nativeTargetOrderCancelSchema.parse(await request.json());
    const order = await recordNativeTargetOrderCancellation({
      marketId: id,
      orderId,
      user,
      txHash: body.txHash
    });
    return NextResponse.json({ order: publicOrder(order) });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
