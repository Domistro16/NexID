import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/services/authService";
import { listNativeTargetOrders, recordNativeTargetOrder } from "@/lib/services/nativeTargetOrderService";
import { jsonError, nativeTargetOrderCreateSchema } from "@/lib/server/validation";

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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSessionUser();
    const orders = await listNativeTargetOrders({ marketId: id, userId: user.id, walletAddress: user.walletAddress });
    return NextResponse.json({ orders: orders.map(publicOrder) });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSessionUser();
    const body = nativeTargetOrderCreateSchema.parse(await request.json());
    if (user.walletAddress.toLowerCase() !== body.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Connected wallet does not match signed-in user" }, { status: 403 });
    }
    const { order } = await recordNativeTargetOrder({
      marketId: id,
      user,
      side: body.side,
      amount: body.amount,
      targetPrice: body.targetPrice,
      walletAddress: body.walletAddress,
      chainId: body.chainId,
      executorAddress: body.executorAddress,
      executorOrderId: body.executorOrderId,
      txHash: body.txHash,
      expiresAt: body.expiresAt
    });
    return NextResponse.json({ order: publicOrder(order) });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
