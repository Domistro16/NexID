import { NextResponse } from "next/server";
import { jsonError, nexmindSourceHealthRunSchema } from "@/lib/server/validation";
import { assertX402Access, paidEndpointMetadata } from "@/lib/services/bankr/x402AccessService";
import { runSourceHealthJob } from "@/lib/services/nexmind/nexmindSourceMonitorService";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(paidEndpointMetadata("source-health", 0.02));
}

export async function POST(request: Request) {
  try {
    assertX402Access(request);
    const body = nexmindSourceHealthRunSchema.parse(await request.json().catch(() => ({})));
    const result = await runSourceHealthJob(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
