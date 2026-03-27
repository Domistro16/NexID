import { BadgeType } from '@prisma/client';
import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Badge Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const BADGE_META: Record<
    BadgeType,
    { glyph: string; name: string; description: string }
> = {
    VERIFIED: {
        glyph: '◈',
        name: 'Verified',
        description: 'Completed one full campaign — quiz + on-chain confirmed',
    },
    CONSISTENT: {
        glyph: '◈◈',
        name: 'Consistent',
        description: '3+ full campaigns completed across any protocols',
    },
    RIGOROUS: {
        glyph: '◈◈◈',
        name: 'Rigorous',
        description: 'Average quiz score ≥ 88 across 5+ campaigns',
    },
    DEFI_ACTIVE: {
        glyph: '⬡',
        name: 'DeFi Active',
        description:
            '4 consecutive weeks of partner on-chain activity (scan-detected)',
    },
    DEFI_FLUENT: {
        glyph: '⬡⬡',
        name: 'DeFi Fluent',
        description: '8 consecutive weeks, 2+ partner protocols',
    },
    DEFI_NATIVE: {
        glyph: '⬡⬡⬡',
        name: 'DeFi Native',
        description: '16 weeks, 3+ protocols, variety of action types',
    },
    PROTOCOL_SPECIALIST: {
        glyph: '▲',
        name: 'Protocol Specialist',
        description:
            'Deep, sustained post-campaign engagement with a specific partner protocol',
    },
    ZERO_FLAGS: {
        glyph: '◆',
        name: 'Zero Flags',
        description:
            'No bot flags, no AI-signal flags, clean lifetime record',
    },
    AGENT_CERTIFIED: {
        glyph: '✦',
        name: 'Agent Certified',
        description:
            'Passed the ElevenLabs voice agent session — top N invite only',
    },
    CROSS_CHAIN: {
        glyph: '⊕',
        name: 'Cross-Chain',
        description: 'Verified wallet activity on 2+ EVM chains',
    },
    CHARTERED: {
        glyph: '★',
        name: 'Chartered',
        description:
            'Top 0.5% globally, 3+ agent sessions, cross-protocol verified',
    },
    EARLY_ADOPTER: {
        glyph: '◐',
        name: 'Early Adopter',
        description:
            "Completed a campaign in NexID's first 90 days of operation",
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Badge Resolvers — each returns true if the user qualifies
// ─────────────────────────────────────────────────────────────────────────────

type ResolverContext = {
    userId: string;
};

async function checkVerified(ctx: ResolverContext): Promise<boolean> {
    const count = await prisma.campaignParticipant.count({
        where: { userId: ctx.userId, completedAt: { not: null } },
    });
    return count >= 1;
}

async function checkConsistent(ctx: ResolverContext): Promise<boolean> {
    const count = await prisma.campaignParticipant.count({
        where: { userId: ctx.userId, completedAt: { not: null } },
    });
    return count >= 3;
}

async function checkRigorous(ctx: ResolverContext): Promise<boolean> {
    const result = await prisma.campaignParticipant.aggregate({
        where: { userId: ctx.userId, completedAt: { not: null }, score: { gt: 0 } },
        _avg: { score: true },
        _count: true,
    });
    return (result._count ?? 0) >= 5 && (result._avg.score ?? 0) >= 88;
}

async function checkDefiActive(ctx: ResolverContext): Promise<boolean> {
    const passport = await prisma.passportScore.findUnique({
        where: { userId: ctx.userId },
    });
    return (passport?.consecutiveActiveWeeks ?? 0) >= 4;
}

async function checkDefiFluent(ctx: ResolverContext): Promise<boolean> {
    const passport = await prisma.passportScore.findUnique({
        where: { userId: ctx.userId },
    });
    return (
        (passport?.consecutiveActiveWeeks ?? 0) >= 8 &&
        (passport?.crossProtocolCount ?? 0) >= 2
    );
}

async function checkDefiNative(ctx: ResolverContext): Promise<boolean> {
    const passport = await prisma.passportScore.findUnique({
        where: { userId: ctx.userId },
    });
    return (
        (passport?.consecutiveActiveWeeks ?? 0) >= 16 &&
        (passport?.crossProtocolCount ?? 0) >= 3
    );
}

async function checkZeroFlags(ctx: ResolverContext): Promise<boolean> {
    // Check for any bot/AI flags. Currently tracked as score=0 with completed
    // campaigns — in the future this should check a dedicated flags table.
    // For now, all completed campaign participants with score > 0 = clean record.
    const flagged = await prisma.campaignParticipant.count({
        where: {
            userId: ctx.userId,
            completedAt: { not: null },
            score: 0,
        },
    });
    const total = await prisma.campaignParticipant.count({
        where: { userId: ctx.userId, completedAt: { not: null } },
    });
    return total >= 1 && flagged === 0;
}

async function checkCrossChain(ctx: ResolverContext): Promise<boolean> {
    // Check scan logs for activity on multiple EVM chainIds
    const chains = await prisma.walletScanLog.findMany({
        where: { userId: ctx.userId, txCount: { gt: 0 } },
        select: { chainId: true },
        distinct: ['chainId'],
    });
    return chains.length >= 2;
}

async function checkEarlyAdopter(ctx: ResolverContext): Promise<boolean> {
    // First campaign completed within 90 days of platform launch
    // Platform launch date should be configured — using a reasonable default
    const PLATFORM_LAUNCH = new Date(
        process.env.NEXID_LAUNCH_DATE ?? '2026-01-01',
    );
    const cutoff = new Date(PLATFORM_LAUNCH);
    cutoff.setDate(cutoff.getDate() + 90);

    const early = await prisma.campaignParticipant.findFirst({
        where: {
            userId: ctx.userId,
            completedAt: { not: null, lte: cutoff },
        },
    });
    return !!early;
}

async function checkAgentCertified(
    ctx: ResolverContext,
): Promise<boolean> {
    // Passed at least one scored agent session with score >= 60
    const passedSession = await prisma.agentSession.findFirst({
        where: {
            userId: ctx.userId,
            sessionType: 'CAMPAIGN_ASSESSMENT',
            status: 'COMPLETED',
            overallScore: { gte: 60 },
        },
    });
    return !!passedSession;
}

async function checkChartered(ctx: ResolverContext): Promise<boolean> {
    // Requires: top 0.5% globally + 3+ passed agent sessions + cross-protocol verified
    const [totalUsers, userRank, passedSessions, passport] = await Promise.all([
        prisma.user.count(),
        prisma.$queryRaw<Array<{ rank: number }>>`
            SELECT COUNT(*)::int + 1 AS "rank"
            FROM "User"
            WHERE "totalPoints" > (
                SELECT "totalPoints" FROM "User" WHERE "id" = ${ctx.userId}
            )
        `,
        prisma.agentSession.count({
            where: {
                userId: ctx.userId,
                status: 'COMPLETED',
                overallScore: { gte: 60 },
            },
        }),
        prisma.passportScore.findUnique({
            where: { userId: ctx.userId },
            select: { crossProtocolCount: true },
        }),
    ]);

    const rank = userRank[0]?.rank ?? totalUsers;
    const topPercentile = totalUsers > 0 ? (rank / totalUsers) * 100 : 100;

    return (
        topPercentile <= 0.5 &&
        passedSessions >= 3 &&
        (passport?.crossProtocolCount ?? 0) >= 3
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry: maps badge type → resolver
// ─────────────────────────────────────────────────────────────────────────────

const RESOLVERS: Record<
    BadgeType,
    (ctx: ResolverContext) => Promise<boolean>
> = {
    VERIFIED: checkVerified,
    CONSISTENT: checkConsistent,
    RIGOROUS: checkRigorous,
    DEFI_ACTIVE: checkDefiActive,
    DEFI_FLUENT: checkDefiFluent,
    DEFI_NATIVE: checkDefiNative,
    PROTOCOL_SPECIALIST: async () => false, // Awarded manually per-partner
    ZERO_FLAGS: checkZeroFlags,
    AGENT_CERTIFIED: checkAgentCertified,
    CROSS_CHAIN: checkCrossChain,
    CHARTERED: checkChartered,
    EARLY_ADOPTER: checkEarlyAdopter,
};

// ─────────────────────────────────────────────────────────────────────────────
// Main API: evaluate and award badges for a user
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate all badge conditions for a user and award any newly earned badges.
 * Returns the list of newly awarded badge types.
 *
 * Safe to call repeatedly — badges are idempotent (unique constraint).
 */
export async function evaluateBadges(
    userId: string,
): Promise<BadgeType[]> {
    const awarded: BadgeType[] = [];

    // Get existing badges so we skip already-earned ones
    const existing = await prisma.badge.findMany({
        where: { userId },
        select: { type: true, partnerId: true },
    });

    const existingSet = new Set(
        existing.map((b) => `${b.type}:${b.partnerId ?? ''}`),
    );

    for (const [type, resolver] of Object.entries(RESOLVERS)) {
        const badgeType = type as BadgeType;
        const key = `${badgeType}:`;

        // Skip if already earned (for non-specialist badges)
        if (badgeType !== 'PROTOCOL_SPECIALIST' && existingSet.has(key)) {
            continue;
        }

        try {
            const qualifies = await resolver({ userId });
            if (qualifies && !existingSet.has(key)) {
                await prisma.badge.create({
                    data: { userId, type: badgeType },
                });
                awarded.push(badgeType);
            }
        } catch (err) {
            console.error(
                `[BadgeEngine] Error evaluating ${badgeType} for ${userId}:`,
                err,
            );
        }
    }

    return awarded;
}

/**
 * Award a Protocol Specialist badge for a specific partner.
 * Called when sustained post-campaign engagement is detected by the scanner.
 */
export async function awardProtocolSpecialist(
    userId: string,
    partnerId: string,
): Promise<boolean> {
    try {
        await prisma.badge.create({
            data: {
                userId,
                type: 'PROTOCOL_SPECIALIST',
                partnerId,
            },
        });
        return true;
    } catch {
        // Already earned (unique constraint)
        return false;
    }
}

/**
 * Get all badges for a user, with display metadata.
 */
export async function getUserBadges(userId: string) {
    const badges = await prisma.badge.findMany({
        where: { userId },
        orderBy: { earnedAt: 'desc' },
    });

    return badges.map((b) => ({
        id: b.id,
        type: b.type,
        partnerId: b.partnerId,
        earnedAt: b.earnedAt,
        ...BADGE_META[b.type],
    }));
}

/**
 * Get the user's selected display badges (up to 3).
 */
export async function getDisplayBadges(userId: string) {
    const display = await prisma.userBadgeDisplay.findUnique({
        where: { userId },
    });

    if (!display) return [];

    const badgeIds = display.badgeIds as string[];
    if (!Array.isArray(badgeIds) || badgeIds.length === 0) return [];

    const badges = await prisma.badge.findMany({
        where: { id: { in: badgeIds }, userId },
    });

    // Preserve selection order
    return badgeIds
        .map((id) => {
            const badge = badges.find((b) => b.id === id);
            if (!badge) return null;
            return { id: badge.id, type: badge.type, ...BADGE_META[badge.type] };
        })
        .filter(Boolean);
}

/**
 * Set the user's selected display badges (max 3).
 */
export async function setDisplayBadges(
    userId: string,
    badgeIds: string[],
): Promise<void> {
    if (badgeIds.length > 3) {
        throw new Error('Maximum 3 display badges allowed');
    }

    // Verify all badges belong to this user
    const owned = await prisma.badge.count({
        where: { id: { in: badgeIds }, userId },
    });
    if (owned !== badgeIds.length) {
        throw new Error('One or more badges not owned by this user');
    }

    await prisma.userBadgeDisplay.upsert({
        where: { userId },
        update: { badgeIds },
        create: { userId, badgeIds },
    });
}
