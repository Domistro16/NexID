import { NextResponse } from "next/server";
import { agentExternalCredentialSchema, jsonError } from "@/lib/server/validation";
import { getAgentProfileByIdOrPublicId, upsertOwnedAgentExternalCredential } from "@/lib/services/agentProfileService";
import { requireSessionUser } from "@/lib/services/authService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgentProfileByIdOrPublicId(id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json({ externalCredentials: agent.externalCredentials });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const credential = agentExternalCredentialSchema.parse(await request.json());
    const externalCredential = await upsertOwnedAgentExternalCredential({
      userId: user.id,
      idOrPublicId: id,
      credential
    });
    return NextResponse.json({ externalCredential });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
