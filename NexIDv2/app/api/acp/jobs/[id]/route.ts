import { NextResponse } from "next/server";
import { acpApiError, getAcpMarketLaunchJob } from "@/lib/services/acp/nexmindAcpService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const job = await getAcpMarketLaunchJob(id);
    return NextResponse.json(job);
  } catch (error) {
    const response = acpApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
