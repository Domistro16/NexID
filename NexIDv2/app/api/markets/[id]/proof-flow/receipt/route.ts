import { NextResponse } from "next/server";
import { getProofFlowSettlement } from "@/lib/services/proofFlowService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proofFlow = await getProofFlowSettlement(id);
  if (!proofFlow) return NextResponse.json({ error: "Market not found" }, { status: 404 });
  return NextResponse.json({ receipt: proofFlow.settlementReceipt ?? null });
}
