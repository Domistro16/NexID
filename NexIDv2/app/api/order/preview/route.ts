import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "Legacy narrative order previews are retired. Use current market room tickets for quotes."
  }, { status: 410 });
}
