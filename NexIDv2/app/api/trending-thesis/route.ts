import { NextResponse } from "next/server";
import { listTrendingTheses } from "@/lib/services/nexmind/nexmindTrendingService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(30, Number(url.searchParams.get("limit") || 12)));
  return NextResponse.json({ theses: await listTrendingTheses(limit) });
}
