import { NextResponse } from "next/server";
import { jsonError, userSignedOrderRecordSchema } from "@/lib/server/validation";
import { requireSessionUser } from "@/lib/services/authService";
import { previewOrder } from "@/lib/services/orderPreviewService";
import { recordUserSignedPosition } from "@/lib/services/positionService";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = userSignedOrderRecordSchema.parse(await request.json());
    const preview = await previewOrder(body);
    if (preview.executionMode !== "user_signed") {
      throw new Error("This deployment is not in user-signed execution mode.");
    }
    if (preview.outcomeToken !== body.outcomeToken) {
      throw new Error("Recorded order token does not match the current mapped market.");
    }
    const marketId = typeof body.marketId === "string"
      ? body.marketId
      : typeof preview.marketId === "string"
        ? preview.marketId
        : null;
    const position = await recordUserSignedPosition({
      userId: user.id,
      walletAddress: user.walletAddress,
      narrativeId: body.narrativeId,
      side: body.side,
      orderType: body.orderType,
      amount: body.amount,
      entryPrice: body.entryPrice ?? preview.price,
      marketId,
      outcomeToken: body.outcomeToken,
      executionId: body.executionId,
      fillStatus: body.fillStatus,
      executionStatus: body.executionStatus,
      raw: body.raw
    });
    return NextResponse.json({ position });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
