import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { RewardMerkleTree } from "@/lib/merkle/reward-tree";
import { requiresAgentAssessment, hasPassedAssessment } from "@/lib/services/claim-gate.service";
import { checkEligibility } from "@/lib/services/agent-session.service";
import { resolveCampaignId } from "@/lib/campaign-route";

/**
 * GET /api/campaigns/[id]/claim
 * Returns the user's claim info for an ended campaign:
 * - Their final rank and reward amount
 * - Whether they've already claimed
 * - Their Merkle proof (if claim tree exists)
 * - Whether they need to complete a Campaign Assessment agent session first
 */
export async function GET(
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

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      title: true,
      status: true,
      prizePoolUsdc: true,
      sponsorName: true,
      coverImageUrl: true,
      escrowId: true,
      escrowAddress: true,
      claimMerkleRoot: true,
      claimTreeJson: true,
      endAt: true,
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status !== "ENDED") {
    return NextResponse.json({ error: "Campaign has not ended yet" }, { status: 400 });
  }

  // Get participant record
  const participant = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
  });

  if (!participant) {
    return NextResponse.json({ error: "You did not participate in this campaign" }, { status: 403 });
  }

  const claimed = !!participant.claimedAt;
  const rewardAmount = participant.rewardAmountUsdc
    ? participant.rewardAmountUsdc.toString()
    : null;

  // Agent session gate: top-N winners must pass a Campaign Assessment before claiming
  let agentSessionRequired = false;
  let agentSessionPassed = false;
  let agentSessionEligibility: {
    eligible: boolean;
    reason?: string;
    queuePosition?: number;
  } | null = null;

  if (rewardAmount && !claimed && participant.rank) {
    agentSessionRequired = await requiresAgentAssessment(participant.rank);
    if (agentSessionRequired) {
      agentSessionPassed = await hasPassedAssessment(auth.user.userId, campaignId);
      // If not yet passed, check if they can request a session
      if (!agentSessionPassed) {
        agentSessionEligibility = await checkEligibility(
          auth.user.userId,
          'CAMPAIGN_ASSESSMENT',
          campaignId,
        );
      }
    }
  }

  // Build Merkle proof if claim tree exists and user has a reward
  let merkleProof: string[] | null = null;
  const assessmentCleared = !agentSessionRequired || agentSessionPassed;
  if (campaign.claimTreeJson && rewardAmount && !claimed && assessmentCleared) {
    try {
      const tree = RewardMerkleTree.deserialize(
        campaign.claimTreeJson as { entries: Array<{ address: string; amount: string }> },
      );
      merkleProof = tree.getProof(auth.user.walletAddress);
    } catch {
      // User might not be in the tree (e.g. no reward earned)
      merkleProof = null;
    }
  }

  const claimReady = !!(
    campaign.claimMerkleRoot &&
    rewardAmount &&
    !claimed &&
    assessmentCleared
  );

  return NextResponse.json({
    campaignId: campaign.id,
    title: campaign.title,
    sponsorName: campaign.sponsorName,
    coverImageUrl: campaign.coverImageUrl,
    prizePoolUsdc: campaign.prizePoolUsdc.toString(),
    endAt: campaign.endAt,
    escrowId: campaign.escrowId,
    escrowAddress: campaign.escrowAddress,
    rank: participant.rank,
    score: participant.score,
    rewardAmountUsdc: rewardAmount,
    claimed,
    claimedAt: participant.claimedAt,
    rewardTxHash: participant.rewardTxHash,
    merkleProof,
    claimReady,
    // Agent session gate info for the frontend
    agentSession: agentSessionRequired
      ? {
          required: true,
          passed: agentSessionPassed,
          // If not passed, tell the user how to request a session
          ...(agentSessionPassed
            ? {}
            : {
                action: "POST /api/agent/session",
                body: { sessionType: "CAMPAIGN_ASSESSMENT", campaignId },
                eligibility: agentSessionEligibility,
              }),
        }
      : { required: false },
  });
}
