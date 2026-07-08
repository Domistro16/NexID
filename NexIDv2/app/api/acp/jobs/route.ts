import { NextResponse } from "next/server";
import { acpMarketLaunchJobSchema } from "@/lib/server/validation";
import { acpApiError, createAcpMarketLaunchJob } from "@/lib/services/acp/nexmindAcpService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = acpMarketLaunchJobSchema.parse(await request.json());
    const job = await createAcpMarketLaunchJob(body);
    return NextResponse.json(job);
  } catch (error) {
    const response = acpApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
