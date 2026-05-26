import { NextResponse } from "next/server";
import { getNarrativeById } from "@/lib/services/narrativeService";
import { refreshMappedMarketsForNarrative } from "@/lib/services/marketMappingService";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const narrative = await getNarrativeById(id);
  if (!narrative) {
    return NextResponse.json({ error: "Narrative not found" }, { status: 404 });
  }
  try {
    const result = await refreshMappedMarketsForNarrative(narrative);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Market refresh failed" }, { status: 502 });
  }
}
