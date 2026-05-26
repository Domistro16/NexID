import { NextResponse } from "next/server";
import { listNarratives } from "@/lib/services/narrativeService";

export const dynamic = "force-dynamic";

export async function GET() {
  const narratives = await listNarratives();
  return NextResponse.json({ narratives });
}
