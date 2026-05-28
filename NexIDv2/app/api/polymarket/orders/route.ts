import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/services/authService";
import { previewOrder } from "@/lib/services/orderPreviewService";
import { placePosition } from "@/lib/services/positionService";
import { jsonError, orderPlaceSchema } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = orderPlaceSchema.parse(await request.json());
    const preview = await previewOrder(body);
    if (preview.executionMode === "user_signed") {
      throw new Error("User-signed Polymarket orders must be submitted from the connected wallet.");
    }
    if (!preview.executionAvailable) {
      throw new Error(preview.executionWarning ?? "Polymarket execution is not available for this market.");
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
    return NextResponse.json({ position, route: "polymarket" });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
