import { NextResponse } from "next/server";
import { jsonError, orderPlaceSchema } from "@/lib/server/validation";
import { requireSessionUser } from "@/lib/services/authService";
import { previewOrder } from "@/lib/services/orderPreviewService";
import { placePosition } from "@/lib/services/positionService";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = orderPlaceSchema.parse(await request.json());
    const preview = await previewOrder(body);
    if (preview.executionMode === "user_signed") {
      throw new Error("User-signed execution must be submitted from the connected wallet, not the server.");
    }
    if (!preview.executionAvailable) {
      throw new Error(preview.executionWarning ?? "Execution is not available for this order.");
    }
    const position = await placePosition({
      userId: user.id,
      narrativeId: body.narrativeId,
      side: body.side,
      orderType: body.orderType,
      amount: body.amount,
      entryPrice: body.entryPrice ?? preview.price,
      walletAddress: user.walletAddress
    });
    return NextResponse.json({ position });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
