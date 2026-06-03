import { NextResponse } from "next/server";
import { listSourceHealth } from "@/lib/services/nexmind/nexmindSourceMonitorService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params;
  return NextResponse.json({ checks: await listSourceHealth(marketId) });
}
