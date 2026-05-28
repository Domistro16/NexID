import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "This legacy narrative order endpoint is retired. Use a market room route or native market trade endpoint."
  }, { status: 410 });
}
