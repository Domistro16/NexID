import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "Manual legacy receipt generation is retired. Market receipts are created automatically by market activity."
  }, { status: 410 });
}
