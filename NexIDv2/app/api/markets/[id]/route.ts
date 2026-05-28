import { NextResponse } from "next/server";
import { getNexMarket } from "@/lib/services/nexmarketsService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const market = await getNexMarket(id);
  if (!market) return NextResponse.json({ error: "Market not found" }, { status: 404 });
  return NextResponse.json({ market });
}
