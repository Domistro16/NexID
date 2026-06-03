import { NextResponse } from "next/server";
import { claimablePayoutRequestSchema, jsonError } from "@/lib/server/validation";
import { requireSessionUser } from "@/lib/services/authService";
import { finalizeClaimablePayout, releaseClaimablePayoutAuthorization, requestClaimablePayout } from "@/lib/services/claimableBalanceService";
import { confirmEdgeRewardDistributorTransaction, signEdgeRewardAuthorization } from "@/lib/services/edgeRewardDistributorService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = claimablePayoutRequestSchema.parse(await request.json().catch(() => ({})));
    if (body.txHash && body.referenceId) {
      await confirmEdgeRewardDistributorTransaction(body.txHash);
      const claim = await finalizeClaimablePayout({
        userId: user.id,
        referenceId: body.referenceId,
        txHash: body.txHash
      });
      return NextResponse.json({ claim });
    }
    const claim = await requestClaimablePayout({
      userId: user.id,
      amountUsd: body.amountUsd,
      destination: body.destination ?? user.walletAddress
    });
    const authorization = await signEdgeRewardAuthorization({
      action: "claim",
      account: user.walletAddress,
      recipient: claim.destination ?? user.walletAddress,
      amountUsd: claim.amountUsd,
      idName: claim.idName,
      referenceId: claim.referenceId
    }).catch(async (error) => {
      await releaseClaimablePayoutAuthorization({ userId: user.id, referenceId: claim.referenceId });
      throw error;
    });
    return NextResponse.json({ claim: { ...claim, authorization } });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
