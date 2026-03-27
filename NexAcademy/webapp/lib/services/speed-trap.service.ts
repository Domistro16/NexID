import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Speed Trap Service
//
// Strategy: "At randomised timestamps (unknown to the user), the video pauses
// and a time-gated prompt appears. User must answer a simple contextual
// question within 8–12 seconds."
//
// Speed traps are drawn from the campaign's question pool (questions with
// isSpeedTrap=true). They fire at random timestamps during video playback.
// ─────────────────────────────────────────────────────────────────────────────

/** Default answer window for speed traps (seconds) */
const DEFAULT_WINDOW_SECONDS = 10;
/** Minimum buffer from video start/end to place traps (seconds) */
const EDGE_BUFFER_SECONDS = 10;
/** Maximum number of speed traps per video */
const MAX_TRAPS_PER_VIDEO = 3;

// ── Types ───────────────────────────────────────────────────────────────────

export interface SpeedTrap {
    id: string;
    questionId: string;
    questionText: string;
    options: string[] | null;
    triggerTimestamp: number;
    windowSeconds: number;
}

export interface SpeedTrapValidation {
    correct: boolean;
    timedOut: boolean;
    responseTime: number;
}

// ── Core Functions ──────────────────────────────────────────────────────────

/**
 * Generate speed traps for a user watching a campaign video.
 *
 * Draws random speed-trap questions from the pool and assigns them
 * random timestamps within the video duration.
 */
export async function generateSpeedTraps(
    campaignId: number,
    userId: string,
    videoDurationSeconds: number,
): Promise<SpeedTrap[]> {
    if (videoDurationSeconds <= EDGE_BUFFER_SECONDS * 2) {
        return []; // Video too short for speed traps
    }

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

    // Draw random subset
    const count = Math.min(MAX_TRAPS_PER_VIDEO, trapQuestions.length);
    const drawn = fisherYatesSample(trapQuestions, count);

    // Generate random timestamps (evenly spread with some randomness)
    const usableRange = videoDurationSeconds - EDGE_BUFFER_SECONDS * 2;
    const segmentSize = usableRange / (count + 1);

    const traps: SpeedTrap[] = drawn.map((q, i) => {
        // Place trap in its segment with ±30% jitter
        const baseTime = EDGE_BUFFER_SECONDS + segmentSize * (i + 1);
        const jitter = (Math.random() - 0.5) * segmentSize * 0.6;
        const timestamp = Math.max(
            EDGE_BUFFER_SECONDS,
            Math.min(videoDurationSeconds - EDGE_BUFFER_SECONDS, baseTime + jitter),
        );

        // Pick a random variant if available
        const variants = q.variants as string[];
        const questionText =
            variants && variants.length > 0
                ? variants[Math.floor(Math.random() * variants.length)]
                : q.questionText;

        return {
            id: `trap_${campaignId}_${userId}_${q.id}`,
            questionId: q.id,
            questionText,
            options: q.options as string[] | null,
            triggerTimestamp: Math.round(timestamp * 100) / 100,
            windowSeconds: q.speedTrapWindow ?? DEFAULT_WINDOW_SECONDS,
        };
    });

    // Sort by timestamp
    traps.sort((a, b) => a.triggerTimestamp - b.triggerTimestamp);

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
    triggerTimestamp: number,
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

    // Record the result
    await prisma.speedTrapInstance.upsert({
        where: {
            campaignId_userId_questionId: { campaignId, userId, questionId },
        },
        create: {
            campaignId,
            userId,
            questionId,
            triggerTimestamp,
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
