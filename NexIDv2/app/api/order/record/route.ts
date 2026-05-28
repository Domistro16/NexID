import { NextResponse } from "next/server";
import { jsonError, userSignedOrderRecordSchema } from "@/lib/server/validation";
import { requireSessionUser } from "@/lib/services/authService";
import { requireDatabase } from "@/lib/server/db";
import { previewOrder } from "@/lib/services/orderPreviewService";
import { recordUserSignedPosition } from "@/lib/services/positionService";

function expectedBuilderCode() {
  const value = process.env.POLYMARKET_BUILDER_CODE ?? process.env.NEXT_PUBLIC_POLYMARKET_BUILDER_CODE;
  if (!value?.trim()) throw new Error("POLYMARKET_BUILDER_CODE is not configured.");
  return value.trim();
}

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
    if (body.builderCode !== expectedBuilderCode()) {
      throw new Error("Recorded order is missing the expected NexMarkets builder attribution.");
    }
    const db = requireDatabase();
    const tradingAccount = await db.polymarketAccount.findUnique({ where: { userId: user.id } });
    if (!tradingAccount) {
      throw new Error("Polymarket deposit wallet is not linked for this user.");
    }
    if (tradingAccount.funderAddress.toLowerCase() !== body.polymarketFunderAddress.toLowerCase() || tradingAccount.signatureType !== body.polymarketSignatureType) {
      throw new Error("Recorded order does not match this user's linked Polymarket trading wallet.");
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
      builderCode: body.builderCode,
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
