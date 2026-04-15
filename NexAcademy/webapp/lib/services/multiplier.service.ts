import prisma from '@/lib/prisma';
import {
    computeBehaviourMultiplier,
    type MultiplierBreakdown,
    type MultiplierInput,
} from '@/lib/scorm/scoring';

/**
 * Compute the full behaviour-based multiplier for a user by gathering
 * all required signals from the database.
 *
 * This is the single source of truth for multiplier calculation.
 * Called during campaign score finalisation.
 */
export async function getUserMultiplier(
    userId: string,
): Promise<MultiplierBreakdown> {
    // Gather all signals in parallel
    const [
        campaignStats,
        shadowBanUser,
        passportScore,
        domainClaim,
        specialistBadgeCount,
        agentBadge,
    ] = await Promise.all([
        // Completed campaign count + average score
        prisma.campaignParticipant.aggregate({
            where: { userId, completedAt: { not: null } },
            _count: true,
            _avg: { score: true },
        }),

        // Shadow-ban is the single source of truth for flagged users.
        // Previously derived from `cp.score = 0`, which wrongly flagged every
        // completed partner campaign (those don't grant completion points).
        prisma.user.findUnique({
            where: { id: userId },
            select: { shadowBanned: true },
        }),

        // Passport score (consecutive weeks + cross-protocol count)
        prisma.passportScore.findUnique({
            where: { userId },
            select: {
                consecutiveActiveWeeks: true,
                crossProtocolCount: true,
            },
        }),

        // .id domain ownership
        prisma.domainClaim.findFirst({
            where: { userId },
            select: { id: true },
        }),

        // Protocol Specialist badge count
        prisma.badge.count({
            where: { userId, type: 'PROTOCOL_SPECIALIST' },
        }),

        // Agent Certified badge
        prisma.badge.findFirst({
            where: { userId, type: 'AGENT_CERTIFIED' },
            select: { id: true },
        }),
    ]);

    const input: MultiplierInput = {
        completedCampaignCount: campaignStats._count ?? 0,
        averageQuizScore: campaignStats._avg.score ?? 0,
        hasAnyFlags: shadowBanUser?.shadowBanned ?? false,
        consecutiveActiveWeeks: passportScore?.consecutiveActiveWeeks ?? 0,
        hasPassedAgentSession: !!agentBadge,
        crossProtocolCount: passportScore?.crossProtocolCount ?? 0,
        hasDomain: !!domainClaim,
        protocolSpecialistBadgeCount: specialistBadgeCount,
    };

    return computeBehaviourMultiplier(input);
}

/**
 * Get multiplier breakdown for display in the user's profile/dashboard.
 * Returns both the breakdown and the raw input signals for transparency.
 */
export async function getUserMultiplierWithContext(userId: string) {
    const multiplier = await getUserMultiplier(userId);
    return {
        multiplier,
        signals: {
            consistentCampaigns:
                multiplier.consistentCampaigns > 1
                    ? '3+ campaigns completed'
                    : null,
            highQuizAverage:
                multiplier.highQuizAverage > 1
                    ? 'Avg quiz score >= 88'
                    : null,
            zeroFlags:
                multiplier.zeroFlags > 1 ? 'Clean record (no flags)' : null,
            onChainActive:
                multiplier.onChainActive > 1
                    ? '4+ consecutive active weeks'
                    : null,
            agentCertified:
                multiplier.agentCertified > 1
                    ? 'Agent session passed'
                    : null,
            crossProtocol:
                multiplier.crossProtocol > 1
                    ? '3+ partner protocols'
                    : null,
            domainHolder:
                multiplier.domainHolder > 1 ? '.id domain holder' : null,
            protocolSpecialist:
                multiplier.protocolSpecialist > 1
                    ? 'Protocol Specialist badges'
                    : null,
        },
    };
}
