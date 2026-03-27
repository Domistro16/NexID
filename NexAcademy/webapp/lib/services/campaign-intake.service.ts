import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Campaign Intake Validation Service
//
// Strategy: "Campaign difficulty tiers are set at intake — protocols cannot
// publish below a minimum bar (e.g., minimum 5 questions, minimum 80%
// threshold to pass). Minimum reward pool in escrow before campaign launches
// — funds are locked, not promised."
// ─────────────────────────────────────────────────────────────────────────────

/** Absolute minimums that no campaign can go below */
const MINIMUM_QUESTIONS = 5;
const MINIMUM_PASS_THRESHOLD = 80;
const MINIMUM_PRIZE_POOL_USDC = 500;

/** Difficulty weight by tier — higher difficulty = more score weight */
const TIER_DIFFICULTY_WEIGHTS: Record<string, number> = {
    LAUNCH_SPRINT: 0.8,
    DEEP_DIVE: 1.0,
    CUSTOM: 1.2,
};

export interface IntakeValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    difficultyWeight: number;
}

/**
 * Validate a campaign's configuration before it can go LIVE.
 * Returns errors (blocking) and warnings (advisory).
 */
export function validateCampaignIntake(campaign: {
    modules: unknown;
    prizePoolUsdc: number | string;
    tier: string;
    minQuestions?: number;
    passThreshold?: number;
    escrowVerified?: boolean;
    escrowAddress?: string | null;
}): IntakeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const prizePool = Number(campaign.prizePoolUsdc);
    const tier = campaign.tier ?? 'LAUNCH_SPRINT';
    const minQuestions = campaign.minQuestions ?? MINIMUM_QUESTIONS;
    const passThreshold = campaign.passThreshold ?? MINIMUM_PASS_THRESHOLD;

    // 1. Prize pool floor
    if (!Number.isFinite(prizePool) || prizePool < MINIMUM_PRIZE_POOL_USDC) {
        errors.push(
            `Prize pool must be at least $${MINIMUM_PRIZE_POOL_USDC} USDC (got $${prizePool})`,
        );
    }

    // 2. Question count floor
    const modules = Array.isArray(campaign.modules)
        ? campaign.modules
        : [];
    const quizModules = modules.filter(
        (m: Record<string, unknown>) => m?.type === 'quiz',
    );
    const totalQuestions = quizModules.reduce(
        (sum: number, m: Record<string, unknown>) => {
            const questions = Array.isArray(m?.questions)
                ? m.questions.length
                : 0;
            return sum + questions;
        },
        0,
    );

    if (totalQuestions < MINIMUM_QUESTIONS) {
        errors.push(
            `Campaign must have at least ${MINIMUM_QUESTIONS} quiz questions (found ${totalQuestions})`,
        );
    }
    if (minQuestions < MINIMUM_QUESTIONS) {
        errors.push(
            `minQuestions cannot be below ${MINIMUM_QUESTIONS}`,
        );
    }

    // 3. Pass threshold floor
    if (passThreshold < MINIMUM_PASS_THRESHOLD) {
        errors.push(
            `Pass threshold must be at least ${MINIMUM_PASS_THRESHOLD}% (set to ${passThreshold}%)`,
        );
    }

    // 4. Escrow verification for going live
    if (!campaign.escrowVerified) {
        if (!campaign.escrowAddress) {
            errors.push(
                'Escrow address must be configured before campaign can go live',
            );
        } else {
            errors.push(
                'Escrow funds must be verified on-chain before campaign can go live',
            );
        }
    }

    // 5. Warnings
    if (totalQuestions < 10) {
        warnings.push(
            'Consider adding more quiz questions (10+ recommended for answer-sharing resistance)',
        );
    }
    if (quizModules.length === 0) {
        warnings.push('No quiz modules found — campaign will have no assessment');
    }

    const difficultyWeight =
        TIER_DIFFICULTY_WEIGHTS[tier] ?? TIER_DIFFICULTY_WEIGHTS.LAUNCH_SPRINT;

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        difficultyWeight,
    };
}

/**
 * Verify escrow funds on-chain for a campaign.
 * Checks the escrow contract balance matches or exceeds the prize pool.
 */
export async function verifyEscrowFunds(campaignId: number): Promise<{
    verified: boolean;
    balance: string | null;
    required: string;
}> {
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
            escrowAddress: true,
            prizePoolUsdc: true,
        },
    });

    if (!campaign || !campaign.escrowAddress) {
        return {
            verified: false,
            balance: null,
            required: campaign?.prizePoolUsdc?.toString() ?? '0',
        };
    }

    const rpcUrl = process.env.ALCHEMY_RPC_URL;
    if (!rpcUrl) {
        return {
            verified: false,
            balance: null,
            required: campaign.prizePoolUsdc.toString(),
        };
    }

    try {
        // Check USDC balance on Base (USDC contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
        const usdcContract = process.env.BASE_USDC_ADDRESS ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
        const balanceOfSelector = '0x70a08231';
        const paddedAddress = campaign.escrowAddress
            .toLowerCase()
            .replace('0x', '')
            .padStart(64, '0');

        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [
                    {
                        to: usdcContract,
                        data: `${balanceOfSelector}${paddedAddress}`,
                    },
                    'latest',
                ],
            }),
        });

        const data = await response.json();
        const rawBalance = BigInt(data?.result ?? '0x0');
        // USDC has 6 decimals
        const balanceUsdc = Number(rawBalance) / 1e6;
        const requiredUsdc = Number(campaign.prizePoolUsdc);
        const verified = balanceUsdc >= requiredUsdc;

        if (verified) {
            await prisma.campaign.update({
                where: { id: campaignId },
                data: {
                    escrowVerified: true,
                    escrowVerifiedAt: new Date(),
                },
            });
        }

        return {
            verified,
            balance: balanceUsdc.toFixed(6),
            required: requiredUsdc.toFixed(6),
        };
    } catch (err) {
        console.error('[CampaignIntake] Escrow verification failed:', err);
        return {
            verified: false,
            balance: null,
            required: campaign.prizePoolUsdc.toString(),
        };
    }
}

/**
 * Get the difficulty weight for scoring adjustments.
 * Higher-difficulty campaigns earn proportionally more score.
 */
export function getDifficultyWeight(tier: string): number {
    return TIER_DIFFICULTY_WEIGHTS[tier] ?? TIER_DIFFICULTY_WEIGHTS.LAUNCH_SPRINT;
}
