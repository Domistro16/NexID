import { NextResponse } from "next/server";
import { jsonError, proofFlowAgentProverPolicySchema } from "@/lib/server/validation";
import { requireDatabase } from "@/lib/server/db";
import { getAgentProverRegistrationPolicy, updateAgentProverRegistrationPolicy } from "@/lib/services/proofFlowProverService";

export const dynamic = "force-dynamic";

function assertInternal(request: Request) {
  const secret = process.env.PROOFFLOW_REVIEW_CRON_SECRET || process.env.INTERNAL_ADMIN_TOKEN || process.env.CRON_SECRET;
  if (!secret) return;
  const url = new URL(request.url);
  const supplied = request.headers.get("x-internal-admin-token")
    || request.headers.get("x-cron-secret")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || url.searchParams.get("secret");
  if (supplied !== secret) throw new Error("Unauthorized internal request.");
}

function serialize(row: {
  id: string;
  policyKey: string;
  agentRegistrationsPaused: boolean;
  weeklyAgentRegistrationCap: number;
  agentStakeUsdc: number;
  agentSlashBps: number;
  poolId: string;
  status: string;
  updatedByWallet: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    policyKey: row.policyKey,
    agentRegistrationsPaused: row.agentRegistrationsPaused,
    weeklyAgentRegistrationCap: row.weeklyAgentRegistrationCap,
    agentStakeUsdc: row.agentStakeUsdc,
    agentSlashBps: row.agentSlashBps,
    poolId: row.poolId,
    status: row.status,
    updatedByWallet: row.updatedByWallet,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function GET(request: Request) {
  try {
    assertInternal(request);
    const policy = await getAgentProverRegistrationPolicy(requireDatabase());
    return NextResponse.json({ policy: serialize(policy) });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertInternal(request);
    const body = proofFlowAgentProverPolicySchema.parse(await request.json());
    const policy = await updateAgentProverRegistrationPolicy(requireDatabase(), body);
    return NextResponse.json({ policy: serialize(policy) });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
