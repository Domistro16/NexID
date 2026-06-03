import { NextResponse } from "next/server";
import { jsonError, nexmindTrendingRunSchema } from "@/lib/server/validation";
import { assertX402Access, paidEndpointMetadata } from "@/lib/services/bankr/x402AccessService";
import { listTrendingTheses, runTrendingThesisJob } from "@/lib/services/nexmind/nexmindTrendingService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertX402Access(request);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(30, Number(url.searchParams.get("limit") || 12)));
    return NextResponse.json({
      ...paidEndpointMetadata("trending-thesis", 0.01),
      theses: await listTrendingTheses(limit)
    });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertX402Access(request);
    const body = nexmindTrendingRunSchema.parse(await request.json().catch(() => ({})));
    const result = await runTrendingThesisJob(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
