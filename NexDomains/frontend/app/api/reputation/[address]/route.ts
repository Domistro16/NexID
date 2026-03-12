import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { checkAddressSecurity } from "@/lib/reputation/goplus";
import { calculateReputation } from "@/lib/reputation/calculator";
import { CHAIN_IDS } from "@/lib/reputation/constants";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  // Validate address
  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: "Invalid wallet address" },
      { status: 400 }
    );
  }

  try {
    // Get chain from query params (default to Base mainnet)
    const searchParams = request.nextUrl.searchParams;
    const chainId = searchParams.get("chainId") || CHAIN_IDS.BASE_MAINNET;

    // Fetch risk data from GoPlus
    const goPlusResponse = await checkAddressSecurity(address, chainId);

    if (goPlusResponse.code !== 1) {
      return NextResponse.json(
        { error: "Failed to fetch security data" },
        { status: 502 }
      );
    }

    // Calculate reputation score
    const reputation = calculateReputation(address, goPlusResponse.result);

    return NextResponse.json(reputation);
  } catch (error) {
    console.error("Reputation check failed:", error);
    return NextResponse.json(
      { error: "Failed to check reputation" },
      { status: 500 }
    );
  }
}
