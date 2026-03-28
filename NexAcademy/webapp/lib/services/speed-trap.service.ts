import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Speed Trap Service
//
// Speed traps are contextual MCQ questions that fire BETWEEN video transitions
// within each module group. Max 2 per group module.
//
// Strategy: "At randomised points (unknown to the user), a time-gated prompt
// appears. User must answer a simple contextual question within 8–12 seconds."
// ─────────────────────────────────────────────────────────────────────────────

/** Default answer window for speed traps (seconds) */
const DEFAULT_WINDOW_SECONDS = 10;
/** Maximum number of speed traps per module group */
const MAX_TRAPS_PER_GROUP = 2;
/** Minimum speed trap question pool per campaign (strategy: 30+ per video) */
const MIN_SPEED_TRAP_POOL = 30;

// ── Types ───────────────────────────────────────────────────────────────────

/** Description of a module group's video count, used to distribute traps */
export interface GroupStructure {
    groupIndex: number;
    videoCount: number;
}

export interface SpeedTrap {
    id: string;
    questionId: string;
    questionText: string;
    options: string[] | null;
    /** Module group index (0-based) */
    triggerAfterGroup: number;
    /** Video index within the group after which this trap fires (0-based) */
    triggerAfterVideoInGroup: number;
    windowSeconds: number;
}

export interface SpeedTrapValidation {
    correct: boolean;
    timedOut: boolean;
    responseTime: number;
}

// ── Core Functions ──────────────────────────────────────────────────────────

/**
 * Generate speed traps for a user in a campaign.
 *
 * Draws random speed-trap questions from the pool and assigns up to 2
 * per module group, distributed across video transitions within each group.
 */
export async function generateSpeedTraps(
    campaignId: number,
    userId: string,
    groups: GroupStructure[],
): Promise<SpeedTrap[]> {
    // Only groups with 2+ videos have transition points
    const eligibleGroups = groups.filter((g) => g.videoCount >= 2);
    if (eligibleGroups.length === 0) return [];

    // Total traps needed across all groups
    const totalTrapsNeeded = eligibleGroups.reduce(
        (sum, g) => sum + Math.min(MAX_TRAPS_PER_GROUP, g.videoCount - 1),
        0,
    );
    if (totalTrapsNeeded === 0) return [];

    // Fetch speed trap questions for this campaign
    const trapQuestions = await prisma.question.findMany({
        where: { campaignId, isSpeedTrap: true, isActive: true },
        select: {
            id: true,
            questionText: true,
            options: true,
            correctIndex: true,
            speedTrapWindow: true,
            variants: true,
        },
    });

    if (trapQuestions.length === 0) return [];

    // Draw random subset (enough for all groups)
    const count = Math.min(totalTrapsNeeded, trapQuestions.length);
    const drawn = fisherYatesSample(trapQuestions, count);

    const traps: SpeedTrap[] = [];
    let questionIdx = 0;

    for (const group of eligibleGroups) {
        const transitionCount = group.videoCount - 1;
        const trapsForGroup = Math.min(MAX_TRAPS_PER_GROUP, transitionCount);
        const questionsAvailable = Math.min(trapsForGroup, drawn.length - questionIdx);

        if (questionsAvailable <= 0) break;

        // Distribute traps evenly across video transitions within this group
        const transitionIndices = distributeTraps(questionsAvailable, transitionCount);

        for (let i = 0; i < questionsAvailable; i++) {
            const q = drawn[questionIdx++];
            if (!q) break;

            // Pick a random variant if available
            const variants = q.variants as string[];
            const questionText =
                variants && variants.length > 0
                    ? variants[Math.floor(Math.random() * variants.length)]
                    : q.questionText;

            traps.push({
                id: `trap_${campaignId}_${userId}_${group.groupIndex}_${q.id}`,
                questionId: q.id,
                questionText,
                options: q.options as string[] | null,
                triggerAfterGroup: group.groupIndex,
                triggerAfterVideoInGroup: transitionIndices[i],
                windowSeconds: q.speedTrapWindow ?? DEFAULT_WINDOW_SECONDS,
            });
        }
    }

    // Sort by group, then by video within group
    traps.sort((a, b) =>
        a.triggerAfterGroup !== b.triggerAfterGroup
            ? a.triggerAfterGroup - b.triggerAfterGroup
            : a.triggerAfterVideoInGroup - b.triggerAfterVideoInGroup,
    );

    return traps;
}

/**
 * Validate a speed trap answer.
 */
export async function validateSpeedTrap(
    campaignId: number,
    userId: string,
    questionId: string,
    selectedIndex: number,
    triggerAfterGroup: number,
    triggerAfterVideoInGroup: number,
    responseTimeSeconds: number,
): Promise<SpeedTrapValidation> {
    const question = await prisma.question.findFirst({
        where: { id: questionId, campaignId, isSpeedTrap: true },
        select: { correctIndex: true, speedTrapWindow: true },
    });

    if (!question) {
        return { correct: false, timedOut: false, responseTime: responseTimeSeconds };
    }

    const window = question.speedTrapWindow ?? DEFAULT_WINDOW_SECONDS;
    const timedOut = responseTimeSeconds > window;
    const correct = !timedOut && selectedIndex === question.correctIndex;

    // Encode group+video as a composite for the triggerTimestamp field
    const compositeTimestamp = triggerAfterGroup * 1000 + triggerAfterVideoInGroup;

    // Record the result
    await prisma.speedTrapInstance.upsert({
        where: {
            campaignId_userId_questionId: { campaignId, userId, questionId },
        },
        create: {
            campaignId,
            userId,
            questionId,
            triggerTimestamp: compositeTimestamp,
            answeredCorrectly: correct,
            timedOut,
            responseTime: responseTimeSeconds,
        },
        update: {
            answeredCorrectly: correct,
            timedOut,
            responseTime: responseTimeSeconds,
        },
    });

    return { correct, timedOut, responseTime: responseTimeSeconds };
}

/**
 * Get speed trap results for a user in a campaign.
 */
export async function getSpeedTrapResults(
    campaignId: number,
    userId: string,
): Promise<{ correct: number; total: number }> {
    const traps = await prisma.speedTrapInstance.findMany({
        where: { campaignId, userId },
    });

    return {
        correct: traps.filter((t) => t.answeredCorrectly === true).length,
        total: traps.length,
    };
}

/**
 * Validate that a campaign has enough speed trap questions.
 * Call at campaign publish time to enforce the 30+ pool requirement.
 */
export async function validateSpeedTrapPool(
    campaignId: number,
): Promise<{ valid: boolean; count: number; required: number }> {
    const count = await prisma.question.count({
        where: { campaignId, isSpeedTrap: true, isActive: true },
    });
    return { valid: count >= MIN_SPEED_TRAP_POOL, count, required: MIN_SPEED_TRAP_POOL };
}

// ── Utilities ───────────────────────────────────────────────────────────────

function fisherYatesSample<T>(arr: T[], count: number): T[] {
    const copy = [...arr];
    const result: T[] = [];
    for (let i = 0; i < count && copy.length > 0; i++) {
        const idx = Math.floor(Math.random() * copy.length);
        result.push(copy[idx]);
        copy[idx] = copy[copy.length - 1];
        copy.pop();
    }
    return result;
}

/**
 * Distribute `count` traps evenly across `transitionCount` transition points.
 * Returns an array of 0-based video indices after which each trap fires.
 *
 * Example: 2 traps across 4 transitions (videos 0-3) → [1, 3]
 */
function distributeTraps(count: number, transitionCount: number): number[] {
    if (transitionCount <= 0 || count <= 0) return [];
    const indices: number[] = [];
    const step = transitionCount / (count + 1);
    for (let i = 1; i <= count; i++) {
        // Add some randomness: ±25% of step size
        const base = step * i;
        const jitter = (Math.random() - 0.5) * step * 0.5;
        const idx = Math.round(Math.max(0, Math.min(transitionCount - 1, base - 1 + jitter)));
        indices.push(idx);
    }
    // Deduplicate: if two traps land on the same video, shift one
    const used = new Set<number>();
    return indices.map((idx) => {
        let final = idx;
        while (used.has(final) && final < transitionCount - 1) final++;
        while (used.has(final) && final > 0) final--;
        used.add(final);
        return final;
    });
}
