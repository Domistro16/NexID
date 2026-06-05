import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/validation";
import { runProofFlowAudit } from "@/lib/services/proofFlowService";
import { requireSessionUser } from "@/lib/services/authService";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSessionUser();
    return NextResponse.json(await runProofFlowAudit({ marketId: id }));
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
