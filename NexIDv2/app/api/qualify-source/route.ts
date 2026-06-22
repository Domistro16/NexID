import { NextResponse } from "next/server";
import { qualifyMarketDraftForLaunch } from "@/lib/services/sourceQualificationService";
import { shapedMarketDraftSchema } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const { draft } = await request.json();
    const parsed = shapedMarketDraftSchema.parse(draft);
    const qualified = await qualifyMarketDraftForLaunch({ draft: parsed });
    return NextResponse.json({ draft: qualified });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Validation failed" }, { status: 400 });
  }
}
