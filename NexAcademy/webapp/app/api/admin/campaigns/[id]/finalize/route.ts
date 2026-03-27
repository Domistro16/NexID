import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { getCampaignRelayer } from '@/lib/services/campaign-relayer.service';
import { RewardMerkleTree, type RewardEntry } from '@/lib/merkle/reward-tree';
import { PARTNER_REWARD_CURVE } from '@/lib/partner-campaign-plans';

/**
 * POST /api/admin/campaigns/[id]/finalize
 * Finalize a campaign:
 *   1. Compute ranked reward allocations from final scores
 *   2. Build a Merkle tree of (address, amount) pairs
 *   3. Store the tree + root in DB
 *   4. Push the Merkle root to the CampaignEscrow contract on-chain
 *   5. Transition campaign status to ENDED
 *
 * Body: { dryRun?: boolean }
 *   If dryRun is true, compute and return the allocations without committing.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    // Load campaign
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
            id: true,
            title: true,
            status: true,
            contractType: true,
            prizePoolUsdc: true,
            escrowId: true,
            escrowAddress: true,
            onChainCampaignId: true,
            partnerContractAddress: true,
            claimMerkleRoot: true,
            rewardSchedule: true,
        },
    });

    if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'ENDED' && campaign.claimMerkleRoot) {
        return NextResponse.json(
            { error: 'Campaign already finalized', claimMerkleRoot: campaign.claimMerkleRoot },
            { status: 409 },
        );
    }

    if (campaign.status !== 'LIVE' && campaign.status !== 'ENDED') {
        return NextResponse.json(
            { error: `Campaign must be LIVE or ENDED to finalize (current: ${campaign.status})` },
            { status: 400 },
        );
    }

    const isPartner = campaign.contractType === 'PARTNER_CAMPAIGNS';

    // For NexID campaigns there's no prize pool — just transition to ENDED
    if (!isPartner) {
        if (!dryRun) {
            await prisma.campaign.update({
                where: { id: campaignId },
                data: {
                    status: 'ENDED',
                    isPublished: false,
                },
            });
        }
        return NextResponse.json({
            finalized: !dryRun,
            dryRun,
            contractType: campaign.contractType,
            message: 'NexID campaign has no prize pool — status set to ENDED',
        });
    }

    // ─── Partner campaign finalization ───

    if (campaign.escrowId === null || !campaign.escrowAddress) {
        return NextResponse.json(
            { error: 'Escrow not configured — create escrow first (POST /create-escrow)' },
            { status: 400 },
        );
    }

    if (campaign.onChainCampaignId === null) {
        return NextResponse.json(
            { error: 'Campaign not deployed on-chain — deploy first (POST /deploy-onchain)' },
            { status: 400 },
        );
    }

    const prizePoolUsdc = Number(campaign.prizePoolUsdc);
    const prizePoolRaw = BigInt(Math.round(prizePoolUsdc * 1e6)); // USDC 6 decimals

    // ─── Read final rankings from the PartnerCampaigns contract (source of truth) ───
    const relayer = getCampaignRelayer();
    const onChainLeaderboard = await relayer.getOnChainLeaderboard(
        campaign.onChainCampaignId,
        campaign.partnerContractAddress,
    );

    if (!onChainLeaderboard) {
        return NextResponse.json(
            { error: 'Failed to read leaderboard from on-chain contract' },
            { status: 502 },
        );
    }

    // Sort by points descending
    const onChainEntries = onChainLeaderboard.users
        .map((addr: string, i: number) => ({
            walletAddress: addr.toLowerCase(),
            points: onChainLeaderboard.points[i],
        }))
        .filter((e: { points: bigint }) => e.points > 0n)
        .sort((a: { points: bigint }, b: { points: bigint }) => {
            const diff = b.points - a.points;
            return diff > 0n ? 1 : diff < 0n ? -1 : 0;
        });

    if (onChainEntries.length === 0) {
        if (!dryRun) {
            await prisma.campaign.update({
                where: { id: campaignId },
                data: { status: 'ENDED', isPublished: false },
            });
        }
        return NextResponse.json({
            finalized: !dryRun,
            dryRun,
            participants: 0,
            message: 'No eligible participants on-chain — campaign ended with no rewards',
        });
    }

    // Map wallet addresses back to userIds via the DB (for reward allocation records)
    const walletAddresses = onChainEntries.map((e: { walletAddress: string }) => e.walletAddress);
    const userRows = await prisma.$queryRaw<
        Array<{ id: string; walletAddress: string }>
    >(
        Prisma.sql`
            SELECT "id", LOWER("walletAddress") AS "walletAddress"
            FROM "User"
            WHERE LOWER("walletAddress") IN (${Prisma.join(walletAddresses)})
        `,
    );
    const walletToUserId = new Map(userRows.map(u => [u.walletAddress, u.id]));

    // Build participant list with on-chain scores as source of truth
    const participants = onChainEntries.map((e: { walletAddress: string; points: bigint }, i: number) => ({
        userId: walletToUserId.get(e.walletAddress) ?? '',
        walletAddress: e.walletAddress,
        score: Number(e.points),
        rank: i + 1,
    })).filter((p: { userId: string }) => p.userId !== ''); // skip wallets not in our DB

    if (participants.length === 0) {
        if (!dryRun) {
            await prisma.campaign.update({
                where: { id: campaignId },
                data: { status: 'ENDED', isPublished: false },
            });
        }
        return NextResponse.json({
            finalized: !dryRun,
            dryRun,
            participants: onChainEntries.length,
            message: 'On-chain participants found but none matched DB users',
        });
    }

    // Get the reward schedule for winner cap
    const schedule = campaign.rewardSchedule as Record<string, unknown> | null;
    const winnerCap = Number(schedule?.winnerCap ?? participants.length);
    const winners = participants.slice(0, winnerCap);

    // ─── Blend agent session scores (40%) with on-chain points (60%) for top-N ───
    // Strategy: "Carries 40% of final score for these users."
    const AGENT_SESSION_WEIGHT = 0.4;
    const ON_CHAIN_WEIGHT = 1 - AGENT_SESSION_WEIGHT;

    // Look up completed CAMPAIGN_ASSESSMENT scores for all winner userIds
    const winnerUserIds = winners.map(w => w.userId);
    const agentSessions = await prisma.agentSession.findMany({
        where: {
            userId: { in: winnerUserIds },
            campaignId,
            sessionType: 'CAMPAIGN_ASSESSMENT',
            status: 'COMPLETED',
            overallScore: { not: null },
        },
        select: { userId: true, overallScore: true },
    });
    const agentScoreMap = new Map(
        agentSessions.map(s => [s.userId, s.overallScore ?? 0]),
    );

    // Normalize on-chain points to 0-100 scale (relative to max in cohort)
    const maxPoints = Math.max(...winners.map(w => w.score), 1);

    for (const w of winners) {
        const normalizedPoints = (w.score / maxPoints) * 100;
        const agentScore = agentScoreMap.get(w.userId);
        if (agentScore !== undefined) {
            // Blend: 60% on-chain + 40% agent session
            w.score = Math.round(ON_CHAIN_WEIGHT * normalizedPoints + AGENT_SESSION_WEIGHT * agentScore);
        } else {
            // No agent session — use normalized on-chain score only
            w.score = Math.round(normalizedPoints);
        }
    }

    // Re-sort by blended score descending, then re-assign ranks
    winners.sort((a, b) => b.score - a.score);
    for (let i = 0; i < winners.length; i++) {
        winners[i].rank = i + 1;
    }

    // ─── Reward Cascade: remove users who failed agent session (score < 70) ───
    // Strategy: "Top-N user who fails agent session or scores below 70 →
    // reward cascades to next qualified user."
    const AGENT_FAIL_THRESHOLD = 70;
    const cascadedOut: Array<{ userId: string; walletAddress: string; agentScore: number }> = [];

    // Only cascade users who HAD an agent session but scored below threshold
    const winnersAfterCascade = winners.filter(w => {
        const agentScore = agentScoreMap.get(w.userId);
        if (agentScore !== undefined && agentScore < AGENT_FAIL_THRESHOLD) {
            cascadedOut.push({ userId: w.userId, walletAddress: w.walletAddress, agentScore });
            return false; // Remove from winners
        }
        return true;
    });

    // Fill cascaded slots from participants who were below the winner cap
    if (cascadedOut.length > 0 && participants.length > winnerCap) {
        const backfillPool = participants
            .slice(winnerCap)
            .slice(0, cascadedOut.length);
        winnersAfterCascade.push(...backfillPool);
    }

    // Re-sort and re-rank after cascade
    winnersAfterCascade.sort((a, b) => b.score - a.score);
    for (let i = 0; i < winnersAfterCascade.length; i++) {
        winnersAfterCascade[i].rank = i + 1;
    }

    // ─── Compute reward allocations using the payout curve ───
    const allocations = computeRewardAllocations(winnersAfterCascade, prizePoolRaw);

    if (dryRun) {
        return NextResponse.json({
            dryRun: true,
            totalParticipants: participants.length,
            eligibleWinners: winnersAfterCascade.length,
            winnerCap,
            prizePoolUsdc,
            agentSessionBlending: {
                weight: AGENT_SESSION_WEIGHT,
                usersWithAgentScore: agentScoreMap.size,
            },
            rewardCascade: {
                cascadedOut: cascadedOut.length,
                threshold: AGENT_FAIL_THRESHOLD,
                details: cascadedOut,
            },
            allocations: allocations.map(a => ({
                rank: a.rank,
                walletAddress: a.address,
                score: a.score,
                agentScore: agentScoreMap.get(a.userId) ?? null,
                rewardUsdc: (Number(a.amount) / 1e6).toFixed(6),
            })),
        });
    }

    // Build Merkle tree
    const entries: RewardEntry[] = allocations
        .filter(a => a.amount > 0n)
        .map(a => ({ address: a.address, amount: a.amount }));

    if (entries.length === 0) {
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'ENDED', isPublished: false },
        });
        return NextResponse.json({
            finalized: true,
            participants: participants.length,
            message: 'No reward allocations — all scores too low',
        });
    }

    const tree = new RewardMerkleTree(entries);
    const root = tree.getRoot();
    const serializedTree = tree.serialize();

    // Push Merkle root on-chain (reuse relayer from leaderboard read above)
    const rootResult = await relayer.setClaimRoot(campaign.escrowId, root, campaign.escrowAddress);
    if (!rootResult.success) {
        return NextResponse.json(
            { error: 'Failed to push Merkle root on-chain', detail: rootResult.error },
            { status: 502 },
        );
    }

    // Update DB: campaign status + Merkle tree + individual reward amounts
    await prisma.$transaction([
        prisma.campaign.update({
            where: { id: campaignId },
            data: {
                status: 'ENDED',
                isPublished: false,
                claimMerkleRoot: root,
                claimTreeJson: serializedTree as unknown as Prisma.InputJsonValue,
            },
        }),
        // Update each participant's rank + reward amount
        ...allocations.map(a =>
            prisma.$executeRaw`
                UPDATE "CampaignParticipant"
                SET
                    "rank" = ${a.rank},
                    "rewardAmountUsdc" = ${Number(a.amount) / 1e6}
                WHERE "campaignId" = ${campaignId} AND "userId" = ${a.userId}
            `,
        ),
    ]);

    return NextResponse.json({
        finalized: true,
        campaignId,
        status: 'ENDED',
        claimMerkleRoot: root,
        setClaimRootTxHash: rootResult.txHash,
        totalParticipants: participants.length,
        eligibleWinners: entries.length,
        prizePoolUsdc,
        allocations: allocations.map(a => ({
            rank: a.rank,
            walletAddress: a.address,
            rewardUsdc: (Number(a.amount) / 1e6).toFixed(6),
        })),
    });
}

// ─── Reward allocation logic ───

type Allocation = {
    userId: string;
    address: string;
    rank: number;
    score: number;
    amount: bigint;
};

/**
 * Distribute the prize pool according to the PARTNER_REWARD_CURVE:
 *   - 1st place: 15%
 *   - 2nd place: 10%
 *   - 3rd place: 5%
 *   - 4th-10th: 10% split equally
 *   - Remaining: 60% split by score weight
 */
function computeRewardAllocations(
    winners: Array<{ userId: string; walletAddress: string; score: number; rank: number }>,
    totalPool: bigint,
): Allocation[] {
    const curve = PARTNER_REWARD_CURVE;
    const allocations: Allocation[] = winners.map(w => ({
        userId: w.userId,
        address: w.walletAddress,
        rank: w.rank,
        score: w.score,
        amount: 0n,
    }));

    if (allocations.length === 0) return [];

    const denom = BigInt(curve.denominatorBps);

    // Fixed top-3 allocations
    if (allocations.length >= 1) {
        allocations[0].amount = (totalPool * BigInt(curve.firstPlaceBps)) / denom;
    }
    if (allocations.length >= 2) {
        allocations[1].amount = (totalPool * BigInt(curve.secondPlaceBps)) / denom;
    }
    if (allocations.length >= 3) {
        allocations[2].amount = (totalPool * BigInt(curve.thirdPlaceBps)) / denom;
    }

    // 4th-10th: split equally
    const fourToTenSlice = allocations.slice(3, 10);
    if (fourToTenSlice.length > 0) {
        const fourToTenPool = (totalPool * BigInt(curve.ranksFourToTenBps)) / denom;
        const perPerson = fourToTenPool / BigInt(fourToTenSlice.length);
        for (const a of fourToTenSlice) {
            a.amount = perPerson;
        }
    }

    // 11th+: split by score weight
    const remainingSlice = allocations.slice(10);
    if (remainingSlice.length > 0) {
        const remainingPool = (totalPool * BigInt(curve.remainingBps)) / denom;
        const totalScore = remainingSlice.reduce((s, a) => s + a.score, 0);

        if (totalScore > 0) {
            for (const a of remainingSlice) {
                a.amount = (remainingPool * BigInt(a.score)) / BigInt(totalScore);
            }
        } else {
            // Equal split if all scores are somehow 0
            const perPerson = remainingPool / BigInt(remainingSlice.length);
            for (const a of remainingSlice) {
                a.amount = perPerson;
            }
        }
    }

    // If fewer than 11 winners, redistribute the unused "remaining" pool to top-3
    if (allocations.length <= 10 && allocations.length >= 1) {
        const usedBps =
            (allocations.length >= 1 ? curve.firstPlaceBps : 0) +
            (allocations.length >= 2 ? curve.secondPlaceBps : 0) +
            (allocations.length >= 3 ? curve.thirdPlaceBps : 0) +
            (fourToTenSlice.length > 0 ? curve.ranksFourToTenBps : 0);
        const unusedBps = curve.denominatorBps - usedBps;

        if (unusedBps > 0) {
            // Distribute unused portion equally among all winners
            const unusedPool = (totalPool * BigInt(unusedBps)) / denom;
            const bonus = unusedPool / BigInt(allocations.length);
            for (const a of allocations) {
                a.amount += bonus;
            }
        }
    }

    return allocations;
}
