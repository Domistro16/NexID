import { NextResponse } from "next/server";
import { jsonError, proofFlowProvisionalSchema } from "@/lib/server/validation";
import { submitProofFlowProvisional } from "@/lib/services/proofFlowService";
import { requireSessionUser } from "@/lib/services/authService";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSessionUser();
    const body = proofFlowProvisionalSchema.parse(await request.json());
    const proofFlow = await submitProofFlowProvisional({ ...body, marketId: id, walletAddress: user.walletAddress });
    return NextResponse.json({ ok: true, proofFlow });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
