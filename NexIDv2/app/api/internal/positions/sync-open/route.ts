import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/validation";
import { syncOpenPositionsForSettlement } from "@/lib/services/positionSettlementService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const result = await syncOpenPositionsForSettlement(Number.isFinite(limit) ? limit : 25);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
