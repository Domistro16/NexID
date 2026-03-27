import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Penalty Service — Graduated Score Penalties
//
// Strategy: "The system degrades rather than binary-blocks."
// - Suspicious quiz behaviour → 20% score reduction
// - Sybil cluster member → 0.5x multiplier
// - Sybil cluster highest-ranking → shadow-ban
// - Engagement anomalies → up to 20% reduction
//
// This replaces the binary shadow-ban for non-critical cases.
// Critical cases (AI content, confirmed sybil) still use shadow-ban.
// ─────────────────────────────────────────────────────────────────────────────

export interface PenaltyResult {
    /** Final multiplier to apply to score (1.0 = no penalty, 0.5 = half score) */
    multiplier: number;
    /** Breakdown of penalties applied */
    penalties: PenaltyDetail[];
}

export interface PenaltyDetail {
    type: string;
    multiplier: number;
    reason: string;
}

/**
 * Calculate penalty multiplier for a user in a specific campaign.
 *
 * Checks:
 * 1. Engagement flags (heartbeat anomaly, tab focus, mouse entropy)
 * 2. Sybil flags (cluster membership)
 * 3. Quiz flags (time limit exceeded, suspicious patterns)
 */
export async function calculatePenalty(
    userId: string,
    campaignId: number,
): Promise<PenaltyResult> {
    const penalties: PenaltyDetail[] = [];
    let multiplier = 1.0;

    // 1. Check engagement flags for this campaign
    const engagementFlags = await prisma.engagementFlag.findMany({
        where: { userId, campaignId },
    });

    const flagTypes = new Set(engagementFlags.map((f) => f.flagType));

    if (flagTypes.has('HEARTBEAT_ANOMALY')) {
        const penalty = 0.9; // 10% reduction
        multiplier *= penalty;
        penalties.push({
            type: 'HEARTBEAT_ANOMALY',
            multiplier: penalty,
            reason: 'Heartbeat timing anomaly detected during video',
        });
    }

    if (flagTypes.has('TAB_FOCUS_LOSS')) {
        const penalty = 0.9; // 10% reduction
        multiplier *= penalty;
        penalties.push({
            type: 'TAB_FOCUS_LOSS',
            multiplier: penalty,
            reason: 'Excessive tab focus loss during video',
        });
    }

    if (flagTypes.has('LOW_MOUSE_ENTROPY')) {
        const penalty = 0.9; // 10% reduction
        multiplier *= penalty;
        penalties.push({
            type: 'LOW_MOUSE_ENTROPY',
            multiplier: penalty,
            reason: 'Low mouse movement entropy (potential automation)',
        });
    }

    // 2. Check sybil flags (non-blocking severity < 3)
    const sybilFlags = await prisma.sybilFlag.findMany({
        where: {
            userId,
            severity: { lt: 3 },
            reviewedAt: null, // Not yet dismissed
        },
    });

    if (sybilFlags.length > 0) {
        // Check if part of a sybil cluster (IP or device fingerprint)
        const hasClusterFlag = sybilFlags.some(
            (f) => f.reason === 'IP_CLUSTER' || f.reason === 'DEVICE_FINGERPRINT_CLUSTER',
        );

        if (hasClusterFlag) {
            const penalty = 0.5; // 50% reduction for cluster members
            multiplier *= penalty;
            penalties.push({
                type: 'SYBIL_CLUSTER_MEMBER',
                multiplier: penalty,
                reason: 'Part of a suspected sybil cluster (IP or device fingerprint match)',
            });
        }

        // Shallow on-chain depth penalty
        const hasShallowDepth = sybilFlags.some(
            (f) => f.reason === 'SHALLOW_ON_CHAIN_DEPTH',
        );
        if (hasShallowDepth) {
            const penalty = 0.8; // 20% reduction
            multiplier *= penalty;
            penalties.push({
                type: 'SHALLOW_ON_CHAIN_DEPTH',
                multiplier: penalty,
                reason: 'Wallet has shallow on-chain transaction history',
            });
        }
    }

    // 3. Check quiz-specific flags
    const quizAttempt = await prisma.quizAttempt.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
    });

    if (quizAttempt) {
        if (quizAttempt.timeLimitExceeded) {
            const penalty = 0.8; // 20% reduction
            multiplier *= penalty;
            penalties.push({
                type: 'QUIZ_TIME_EXCEEDED',
                multiplier: penalty,
                reason: 'Exceeded time limit on one or more quiz questions',
            });
        }
    }

    return {
        multiplier: Math.max(0, Math.min(1, multiplier)),
        penalties,
    };
}

/**
 * Apply penalty multiplier to a score.
 */
export function applyPenalty(score: number, penaltyMultiplier: number): number {
    return Math.round(score * penaltyMultiplier);
}
