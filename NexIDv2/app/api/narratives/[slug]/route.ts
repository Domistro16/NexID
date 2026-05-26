import { NextResponse } from "next/server";
import { getNarrativeById } from "@/lib/services/narrativeService";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const narrative = await getNarrativeById(slug);
  if (!narrative) {
    return NextResponse.json({ error: "Narrative not found" }, { status: 404 });
  }
  return NextResponse.json({ narrative });
}
