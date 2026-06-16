import { NextResponse } from "next/server";
import { agentControlSchema, jsonError } from "@/lib/server/validation";
import { requireSessionUser } from "@/lib/services/authService";
import { updateOwnedAgentControls } from "@/lib/services/agentLaunchService";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = agentControlSchema.parse(await request.json());
    const agent = await updateOwnedAgentControls({
      user,
      agentId: id,
      action: body.action,
      dailyLaunchLimit: body.dailyLaunchLimit,
      maxBondSpendUsdc: body.maxBondSpendUsdc
    });
    return NextResponse.json({ agent });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
