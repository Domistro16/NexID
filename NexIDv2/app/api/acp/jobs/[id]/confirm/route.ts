import { NextResponse } from "next/server";
import { acpMarketLaunchConfirmSchema } from "@/lib/server/validation";
import { acpApiError, confirmAcpMarketLaunchJob } from "@/lib/services/acp/nexmindAcpService";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = acpMarketLaunchConfirmSchema.parse(await request.json());
    const job = await confirmAcpMarketLaunchJob(id, body);
    return NextResponse.json(job);
  } catch (error) {
    const response = acpApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
