import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import prisma from "@/lib/prisma";
import { config } from "@/lib/config";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { getCampaignRelayer } from "@/lib/services/campaign-relayer.service";
import { RewardMerkleTree } from "@/lib/merkle/reward-tree";
import { CLAIM_REWARD_TYPES, buildClaimDomain } from "@/lib/contracts/campaign-escrow-abi";
import { requiresAgentAssessment, hasPassedAssessment } from "@/lib/services/claim-gate.service";
import { resolveCampaignId } from "@/lib/campaign-route";

/**
 * POST /api/campaigns/[id]/claim/submit
 * Submit a gasless reward claim. The user signs an EIP-712 message; the relayer
 * submits the on-chain transaction and pays gas. USDC goes to the user's wallet.
 *
 * Body: { signature: string, deadline: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = await resolveCampaignId(id);
  if (campaignId === null) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Parse body
  let body: { signature: string; deadline: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { signature, deadline } = body;
  if (!signature || !deadline) {
    return NextResponse.json({ error: "Missing signature or deadline" }, { status: 400 });
  }

  // Verify deadline hasn't passed
  const now = Math.floor(Date.now() / 1000);
  if (deadline < now) {
    return NextResponse.json({ error: "Signature has expired" }, { status: 400 });
  }

  // Load campaign
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      status: true,
      escrowId: true,
      escrowAddress: true,
      claimMerkleRoot: true,
      claimTreeJson: true,
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "ENDED") {
    return NextResponse.json({ error: "Campaign has not ended yet" }, { status: 400 });
  }
  if (campaign.escrowId === null || !campaign.escrowAddress) {
    return NextResponse.json({ error: "Escrow not configured for this campaign" }, { status: 400 });
  }
  if (!campaign.claimMerkleRoot || !campaign.claimTreeJson) {
    return NextResponse.json({ error: "Claim tree not published yet" }, { status: 400 });
  }

  // Get participant
  const participant = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
  });

  if (!participant) {
    return NextResponse.json({ error: "You did not participate in this campaign" }, { status: 403 });
  }
  if (participant.claimedAt) {
    return NextResponse.json({ error: "Reward already claimed" }, { status: 400 });
  }

  // Atomic guard: claim the slot so concurrent requests can't double-claim.
  const claimLock = await prisma.$executeRaw`
    UPDATE "CampaignParticipant"
    SET "claimedAt" = NOW()
    WHERE "campaignId" = ${campaignId} AND "userId" = ${auth.user.userId} AND "claimedAt" IS NULL
  `;
  if (claimLock === 0) {
    return NextResponse.json({ error: "Reward already claimed" }, { status: 400 });
  }
  if (!participant.rewardAmountUsdc) {
    return NextResponse.json({ error: "No reward allocated for your rank" }, { status: 400 });
  }

  // Agent session gate: top-N winners must pass a Campaign Assessment before claiming
  if (participant.rank) {
    const needsAssessment = await requiresAgentAssessment(participant.rank);
    if (needsAssessment) {
      const passed = await hasPassedAssessment(auth.user.userId, campaignId);
      if (!passed) {
        return NextResponse.json(
          {
            error: "You must complete a Campaign Assessment session before claiming your reward",
            agentSessionRequired: true,
          },
          { status: 403 },
        );
      }
    }
  }

  // Convert reward to USDC amount (6 decimals)
  const rewardAmountBigInt = BigInt(
    participant.rewardAmountUsdc.mul(1_000_000).toFixed(0),
  );

  // Build Merkle proof
  let merkleProof: string[];
  try {
    const tree = RewardMerkleTree.deserialize(
      campaign.claimTreeJson as { entries: Array<{ address: string; amount: string }> },
    );
    merkleProof = tree.getProof(auth.user.walletAddress);
  } catch {
    return NextResponse.json({ error: "Could not generate Merkle proof for your address" }, { status: 400 });
  }

  // Verify the EIP-712 signature matches the claim parameters
  const escrowAddress = campaign.escrowAddress;
  const domain = buildClaimDomain(escrowAddress, config.chainId);
  const claimMessage = {
    escrowId: BigInt(campaign.escrowId),
    claimer: auth.user.walletAddress,
    amount: rewardAmountBigInt,
    deadline: BigInt(deadline),
  };

  try {
    const recovered = ethers.verifyTypedData(
      domain,
      CLAIM_REWARD_TYPES,
      claimMessage,
      signature,
    );
    if (recovered.toLowerCase() !== auth.user.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Invalid signature — signer mismatch" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid EIP-712 signature" }, { status: 400 });
  }

  // Split signature into v, r, s for the contract call
  const sig = ethers.Signature.from(signature);

  // Submit via relayer
  const relayer = getCampaignRelayer();
  const result = await relayer.claimRewardFor(
    campaign.escrowId,
    auth.user.walletAddress,
    rewardAmountBigInt,
    merkleProof,
    deadline,
    sig.v,
    sig.r,
    sig.s,
  );

  if (!result.success) {
    console.error("Relayer claimRewardFor failed:", result.error);
    return NextResponse.json(
      { error: "On-chain claim failed", detail: result.error },
      { status: 502 },
    );
  }

  // Update DB — store claim details (claimedAt already set by atomic lock above)
  await prisma.campaignParticipant.update({
    where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
    data: {
      claimSignature: signature,
      rewardTxHash: result.txHash,
    },
  });

  return NextResponse.json({
    success: true,
    txHash: result.txHash,
    amountUsdc: participant.rewardAmountUsdc.toString(),
  });
}
