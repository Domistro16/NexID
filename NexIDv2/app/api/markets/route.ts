import { NextResponse } from "next/server";
import { listNexMarkets } from "@/lib/services/nexmarketsService";

export const dynamic = "force-dynamic";

export async function GET() {
  const markets = await listNexMarkets();
  return NextResponse.json({ markets });
}
