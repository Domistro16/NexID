import { NextResponse } from "next/server";
import { agentMarketDraftSchema, jsonError } from "@/lib/server/validation";
import { assertX402Access, paidEndpointMetadata } from "@/lib/services/bankr/x402AccessService";
import { composeNexMindMarketDraft } from "@/lib/services/nexmind/nexmindDraftService";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(paidEndpointMetadata("draft-market", 0.01));
}

export async function POST(request: Request) {
  try {
    assertX402Access(request);
    const body = agentMarketDraftSchema.parse(await request.json());
    const draft = await composeNexMindMarketDraft({ rawThesis: body.rawThesis, arenaHint: body.arenaHint });
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
