import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { getProofFlowSettlement } from "@/lib/services/proofFlowService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser().catch(() => null);
  const proofFlow = await getProofFlowSettlement(id, user?.walletAddress);
  if (!proofFlow) return NextResponse.json({ error: "Market not found" }, { status: 404 });
  return NextResponse.json({
    currentReviewPanel: proofFlow.currentReviewPanel ?? null,
    reviewPanels: proofFlow.reviewPanels ?? []
  });
}
