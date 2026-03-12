import { NextRequest, NextResponse } from "next/server";

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

    // In a full implementation, fetch points from blockchain or database
    // The actual points are fetched client-side using wagmi's useReadContract
    return NextResponse.json({
      message: "Use client-side wagmi hooks to fetch user points",
      walletAddress,
    });
  } catch (error) {
    console.error("Points fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch points" },
      { status: 500 }
    );
  }
}
