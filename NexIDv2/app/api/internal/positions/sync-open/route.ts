import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({
    error: "Legacy open-position settlement sync is retired. Use /api/internal/native-resolution/run for current markets."
  }, { status: 410 });
}
