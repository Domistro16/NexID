import { NextResponse } from "next/server";
import { jsonError, proofFlowAgentProverRegisterSchema } from "@/lib/server/validation";
import { registerAgentProver } from "@/lib/services/proofFlowProverService";

export const dynamic = "force-dynamic";

function serialize(row: {
  id: string;
  walletAddress: string;
  agentProfileId: string | null;
  idName: string | null;
  displayName: string | null;
  roleType: string;
  poolId: string;
  status: string;
  stakeAmountUsdc: number;
  stakeStatus: string;
  stakeTxHash: string | null;
  registrationWeekStart: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    walletAddress: row.walletAddress,
    agentProfileId: row.agentProfileId,
    idName: row.idName,
    displayName: row.displayName,
    roleType: row.roleType,
    poolId: row.poolId,
    status: row.status,
    stakeAmountUsdc: row.stakeAmountUsdc,
    stakeStatus: row.stakeStatus,
    stakeTxHash: row.stakeTxHash,
    registrationWeekStart: row.registrationWeekStart?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function POST(request: Request) {
  try {
    const body = proofFlowAgentProverRegisterSchema.parse(await request.json());
    const prover = await registerAgentProver(body);
    return NextResponse.json({ prover: serialize(prover) });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
