import { NextResponse } from "next/server";
import { shapeMarketSchema, jsonError } from "@/lib/server/validation";
import { getSessionUser } from "@/lib/services/authService";
import { composeNexMindMarketDraft } from "@/lib/services/nexmind/nexmindDraftService";
import { saveMarketDraft } from "@/lib/services/nexmarketsService";

export async function POST(request: Request) {
  try {
    const body = shapeMarketSchema.parse(await request.json());
    const user = await getSessionUser();
    const draft = await composeNexMindMarketDraft({ rawThesis: body.rawThesis, arenaHint: body.arenaHint, user });
    const saved = await saveMarketDraft(draft, user);
    return NextResponse.json({ draftId: saved.id, draft });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
