import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/services/authService";
import { syncUserSignedPositionSettlement } from "@/lib/services/positionService";
import { jsonError, userSignedPositionSyncSchema } from "@/lib/server/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = userSignedPositionSyncSchema.parse(await request.json());
    const position = await syncUserSignedPositionSettlement({
      positionId: id,
      userId: user.id,
      userWalletAddress: user.walletAddress,
      executionId: body.executionId,
      walletAddress: body.walletAddress,
      outcomeToken: body.outcomeToken,
      status: body.status,
      fillStatus: body.fillStatus,
      exitPrice: body.exitPrice,
      settlementPrice: body.settlementPrice,
      averagePrice: body.averagePrice,
      filledSize: body.filledSize,
      originalSize: body.originalSize,
      settledAt: body.settledAt,
      raw: body.raw
    });
    return NextResponse.json({ position });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
