import { NextResponse } from "next/server";
import { listAgentLaunches } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const launches = await listAgentLaunches(id);
  if (!launches) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json(launches);
}
