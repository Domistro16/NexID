import { NextResponse } from "next/server";
import { getAgentProfileByIdOrPublicId } from "@/lib/services/agentProfileService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgentProfileByIdOrPublicId(id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json({ badges: agent.badges });
}
