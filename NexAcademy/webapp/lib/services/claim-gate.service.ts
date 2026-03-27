import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Claim Gate Service
//
// Strategy: "Top-N winners must complete a Campaign Assessment agent session
// (scored, 3-5 min) before they can claim their USDC reward. This prevents
// answer-sharing and bot-farming — you have to prove comprehension to an AI
// agent before the money moves."
//
// If the CAMPAIGN_ASSESSMENT session type has topNEligible > 0, users within
// that rank cutoff must have a COMPLETED session with overallScore >= 60 for
// the specific campaign before the claim is unlocked.
//
// Users ranked OUTSIDE topNEligible (or when topNEligible = 0) can claim
// directly without an agent session.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum agent session score to pass the assessment */
const ASSESSMENT_PASS_SCORE = 60;

/**
 * Check whether a user at the given rank is required to pass a
 * Campaign Assessment agent session before claiming.
 *
 * Returns true if:
 *   - The CAMPAIGN_ASSESSMENT slot config exists and is enabled
 *   - topNEligible > 0
 *   - The user's rank is within topNEligible
 */
export async function requiresAgentAssessment(rank: number): Promise<boolean> {
    const config = await prisma.agentSlotConfig.findUnique({
        where: { sessionType: 'CAMPAIGN_ASSESSMENT' },
        select: { enabled: true, topNEligible: true },
    });

    // No config or disabled — no gate
    if (!config || !config.enabled) return false;

    // topNEligible = 0 means no assessment gate
    if (config.topNEligible <= 0) return false;

    // Only top-N ranked users are gated
    return rank <= config.topNEligible;
}

/**
 * Check whether a user has passed a Campaign Assessment for a specific campaign.
 *
 * Returns true if there is a COMPLETED CAMPAIGN_ASSESSMENT session for the
 * given userId + campaignId with overallScore >= ASSESSMENT_PASS_SCORE.
 */
export async function hasPassedAssessment(
    userId: string,
    campaignId: number,
): Promise<boolean> {
    const session = await prisma.agentSession.findFirst({
        where: {
            userId,
            campaignId,
            sessionType: 'CAMPAIGN_ASSESSMENT',
            status: 'COMPLETED',
            overallScore: { gte: ASSESSMENT_PASS_SCORE },
        },
        select: { id: true },
    });

    return session !== null;
}
