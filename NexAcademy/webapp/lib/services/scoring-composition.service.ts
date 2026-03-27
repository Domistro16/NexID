// ─────────────────────────────────────────────────────────────────────────────
// Scoring Composition Service
//
// Strategy: 4-layer weighted scoring model
//   Video Completion: 20% (speed-trap accuracy, heartbeat consistency, completion)
//   Quiz Score:       30% (AI semantic grade for free-text, MCQ accuracy)
//   Onchain Action:   10% (binary pass/fail + amount bonus)
//   Agent Session:    40% (top-N users only; others score 0 on this layer)
//
// Wallet multiplier is applied to the composite total.
// ─────────────────────────────────────────────────────────────────────────────

/** Scoring weights (must sum to 1.0) */
const WEIGHTS = {
    VIDEO: 0.20,
    QUIZ: 0.30,
    ONCHAIN: 0.10,
    AGENT: 0.40,
} as const;

// ── Types ───────────────────────────────────────────────────────────────────

export interface ComponentScores {
    videoScore: number;    // 0-100
    quizScore: number;     // 0-100
    onchainScore: number;  // 0-100
    agentScore: number;    // 0-100 (0 if no agent session)
}

export interface CompositeResult {
    components: ComponentScores;
    compositeScore: number;    // 0-100 (weighted)
    hasAgentSession: boolean;
}

// ── Core Calculation ────────────────────────────────────────────────────────

/**
 * Calculate the composite score from all 4 components.
 *
 * For users WITHOUT an agent session:
 * - Agent weight is redistributed proportionally to other layers
 * - Video: 28.6%, Quiz: 42.8%, Onchain: 14.3%, Agent: 0% (≈ 20/30/10 normalized)
 */
export function calculateCompositeScore(
    components: ComponentScores,
): CompositeResult {
    const hasAgentSession = components.agentScore > 0;

    let composite: number;

    if (hasAgentSession) {
        // Full 4-layer weighted scoring
        composite = Math.round(
            components.videoScore * WEIGHTS.VIDEO +
            components.quizScore * WEIGHTS.QUIZ +
            components.onchainScore * WEIGHTS.ONCHAIN +
            components.agentScore * WEIGHTS.AGENT,
        );
    } else {
        // Redistribute agent weight proportionally to other layers
        const nonAgentTotal = WEIGHTS.VIDEO + WEIGHTS.QUIZ + WEIGHTS.ONCHAIN;
        composite = Math.round(
            components.videoScore * (WEIGHTS.VIDEO / nonAgentTotal) +
            components.quizScore * (WEIGHTS.QUIZ / nonAgentTotal) +
            components.onchainScore * (WEIGHTS.ONCHAIN / nonAgentTotal),
        );
    }

    return {
        components,
        compositeScore: Math.max(0, Math.min(100, composite)),
        hasAgentSession,
    };
}

// ── Video Score Calculation ─────────────────────────────────────────────────

/**
 * Calculate video completion score from engagement data.
 *
 * Factors:
 * - Module completion (60%): Did they watch all video modules?
 * - Speed trap accuracy (25%): How many speed traps answered correctly?
 * - Heartbeat consistency (15%): Were there engagement flag anomalies?
 */
export function calculateVideoScore(data: {
    modulesCompleted: number;
    totalModules: number;
    speedTrapsCorrect: number;
    speedTrapsTotal: number;
    hasHeartbeatAnomaly: boolean;
    hasTabFocusIssue: boolean;
    hasLowMouseEntropy: boolean;
}): number {
    // Module completion (60% of video score)
    const completionPct = data.totalModules > 0
        ? (data.modulesCompleted / data.totalModules)
        : 0;
    const completionScore = completionPct * 100;

    // Speed trap accuracy (25% of video score)
    const trapPct = data.speedTrapsTotal > 0
        ? (data.speedTrapsCorrect / data.speedTrapsTotal)
        : 1; // No traps = full credit
    const trapScore = trapPct * 100;

    // Heartbeat/engagement consistency (15% of video score)
    let engagementScore = 100;
    if (data.hasHeartbeatAnomaly) engagementScore -= 40;
    if (data.hasTabFocusIssue) engagementScore -= 30;
    if (data.hasLowMouseEntropy) engagementScore -= 30;
    engagementScore = Math.max(0, engagementScore);

    const total = Math.round(
        completionScore * 0.60 +
        trapScore * 0.25 +
        engagementScore * 0.15,
    );

    return Math.max(0, Math.min(100, total));
}

// ── Onchain Score Calculation ───────────────────────────────────────────────

/**
 * Calculate onchain action score.
 *
 * Binary pass/fail (80%) + amount bonus (20%).
 * If the user completed the required onchain action, they get base 80.
 * If they did more than the minimum (e.g., larger swap), bonus up to 20 more.
 */
export function calculateOnchainScore(data: {
    actionCompleted: boolean;
    /** Ratio of actual amount to minimum required (1.0 = exact minimum) */
    amountRatio?: number;
}): number {
    if (!data.actionCompleted) return 0;

    const base = 80;
    const ratio = data.amountRatio ?? 1.0;
    // Bonus scales linearly from 0 to 20 for ratios 1.0 to 3.0+
    const bonus = Math.min(20, Math.round((Math.min(ratio, 3) - 1) * 10));

    return Math.min(100, base + bonus);
}
