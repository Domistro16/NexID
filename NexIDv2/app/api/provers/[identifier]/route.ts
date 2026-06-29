import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/validation";
import { getPublicProverProfile } from "@/lib/services/proofFlowProverService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  try {
    const { identifier } = await params;
    const prover = await getPublicProverProfile(decodeURIComponent(identifier));
    if (!prover) return NextResponse.json({ error: "Prover profile not found." }, { status: 404 });
    return NextResponse.json({ prover });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
