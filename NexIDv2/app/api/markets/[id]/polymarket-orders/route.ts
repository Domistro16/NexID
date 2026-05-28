import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/services/authService";
import { requireDatabase } from "@/lib/server/db";
import { jsonError, polymarketRouteOrderRecordSchema } from "@/lib/server/validation";

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

function tokenList(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function sideLabel(side: "ride" | "fade") {
  return side === "ride" ? "Rode" : "Faded";
}

function expectedBuilderCode() {
  const value = process.env.POLYMARKET_BUILDER_CODE ?? process.env.NEXT_PUBLIC_POLYMARKET_BUILDER_CODE;
  if (!value?.trim()) throw new Error("POLYMARKET_BUILDER_CODE is not configured.");
  return value.trim();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const body = polymarketRouteOrderRecordSchema.parse(await request.json());
    if (user.walletAddress.toLowerCase() !== body.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Connected wallet does not match signed-in user" }, { status: 403 });
    }

    const { id } = await params;
    const db = requireDatabase();
    const tradingAccount = await db.polymarketAccount.findUnique({ where: { userId: user.id } });
    if (!tradingAccount) {
      return NextResponse.json({ error: "Polymarket deposit wallet is not linked for this user." }, { status: 400 });
    }
    if (tradingAccount.funderAddress.toLowerCase() !== body.polymarketFunderAddress.toLowerCase() || tradingAccount.signatureType !== body.polymarketSignatureType) {
      return NextResponse.json({ error: "Recorded order does not match this user's linked Polymarket trading wallet." }, { status: 400 });
    }

    const market = await db.market.findUnique({ where: { id } });
    if (!market) return NextResponse.json({ error: "Market not found" }, { status: 404 });
    if (market.origin !== "polymarket" || !market.polymarketMarketId) {
      return NextResponse.json({ error: "This market is not a Polymarket route" }, { status: 400 });
    }

    const tokens = tokenList(market.polymarketClobTokenIds);
    const expectedToken = body.side === "ride" ? tokens[0] : tokens[1];
    if (!expectedToken) {
      return NextResponse.json({ error: "This routed market is missing the Polymarket outcome token for that side" }, { status: 400 });
    }

    if (body.outcomeToken !== expectedToken) {
      return NextResponse.json({ error: "Recorded order token does not match this Ride/Fade side" }, { status: 400 });
    }
    const builderCode = expectedBuilderCode();
    if (body.builderCode !== builderCode) {
      return NextResponse.json({ error: "Recorded order is missing the expected NexMarkets builder attribution" }, { status: 400 });
    }

    const receipt = await db.marketReceipt.create({
      data: {
        marketId: market.id,
        userId: user.id,
        walletAddress: user.walletAddress,
        side: body.side,
        title: `${sideLabel(body.side)} ${market.title}`,
        proof: "Polymarket user-authenticated CLOB",
        payload: jsonInput({
          origin: "polymarket",
          polymarketMarketId: market.polymarketMarketId,
          outcomeToken: body.outcomeToken,
          executionId: body.executionId,
          fillStatus: body.fillStatus ?? "submitted",
          executionStatus: body.executionStatus,
          executionMode: "user_signed",
          orderType: body.orderType,
          amount: body.amount,
          entryPrice: body.entryPrice,
          walletAddress: body.walletAddress,
          polymarketFunderAddress: tradingAccount.funderAddress,
          polymarketSignatureType: tradingAccount.signatureType,
          polymarketWalletType: tradingAccount.walletType,
          builder: builderCode,
          raw: body.raw ?? null
        })
      }
    });

    return NextResponse.json({
      execution: {
        executionId: body.executionId,
        status: body.executionStatus,
        fillStatus: body.fillStatus ?? "submitted",
        outcomeToken: body.outcomeToken,
        builder: builderCode
      },
      receipt: {
        id: receipt.id,
        marketId: receipt.marketId,
        title: receipt.title,
        proof: receipt.proof,
        createdAt: receipt.createdAt.toISOString()
      }
    });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
