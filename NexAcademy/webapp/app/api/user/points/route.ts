import { NextRequest, NextResponse } from "next/server";
import { getCumulativePartnerDisplayPoints } from "@/lib/services/onchain-points.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get("address");

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address required" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      walletAddress,
      totalPoints: await getCumulativePartnerDisplayPoints(walletAddress),
    });
  } catch (error) {
    console.error("Points fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch points" },
      { status: 500 }
    );
  }
}
