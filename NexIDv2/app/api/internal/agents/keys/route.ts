import { NextResponse } from "next/server";
import { internalAgentApiKeyCreateSchema, jsonError } from "@/lib/server/validation";
import { verifyInternalAdminToken } from "@/lib/server/internal-admin-auth";
import { createAgentApiKey } from "@/lib/services/bankr/agentAuthService";

export const dynamic = "force-dynamic";

function assertAdmin(request: Request) {
  const supplied = request.headers.get("x-internal-admin-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!verifyInternalAdminToken(supplied)) throw new Error("Internal admin token required.");
}

export async function POST(request: Request) {
  try {
    assertAdmin(request);
    const body = internalAgentApiKeyCreateSchema.parse(await request.json());
    const key = await createAgentApiKey(body);
    return NextResponse.json({ key });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
