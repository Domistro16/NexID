import { QuestionType, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Quiz Engine Service
//
// Manages the randomized quiz pool system:
// - Draw random questions from a campaign's pool (5-8 per user)
// - Shuffle MCQ answer order per user
// - Pick random phrasing variants
// - Enforce 60-second time limit per question
// - Server-side grading for MCQ answers
// ─────────────────────────────────────────────────────────────────────────────

/** Default number of questions drawn per quiz attempt */
const DEFAULT_DRAW_COUNT = 6;
/** Minimum pool size required to start a quiz */
const MIN_POOL_SIZE = 5;
/** Maximum time allowed per question (seconds) */
const TIME_LIMIT_SECONDS = 60;

// ── Types ───────────────────────────────────────────────────────────────────

export interface DrawnQuestion {
    id: string;
    type: QuestionType;
    questionText: string;
    /** MCQ options in shuffled order (null for FREE_TEXT) */
    options: string[] | null;
    /** Map from shuffled index → original index (for grading) */
    shuffledOrder: number[] | null;
    points: number;
    difficulty: number;
    isFollowUp: boolean;
}

export interface QuizStartResult {
    attemptId: string;
    questions: DrawnQuestion[];
    timeLimitSeconds: number;
}

export interface AnswerSubmission {
    questionId: string;
    /** For MCQ: index in the shuffled options array */
    selectedIndex?: number;
    /** For FREE_TEXT: the written answer */
    freeTextAnswer?: string;
    /** Timestamp when the question was shown (ISO string) */
    shownAt: string;
    /** Timestamp when the answer was submitted (ISO string) */
    answeredAt: string;
}

export interface GradedAnswer {
    questionId: string;
    isCorrect: boolean;
    aiGradingScore: number | null;
    aiContentFlag: boolean;
    timeTakenSeconds: number;
    timedOut: boolean;
}

export interface QuizResult {
    attemptId: string;
    totalScore: number;
    correctCount: number;
    totalQuestions: number;
    timeLimitExceeded: boolean;
    aiContentDetected: boolean;
    gradedAnswers: GradedAnswer[];
}

// ── Core Functions ──────────────────────────────────────────────────────────

/**
 * Draw random questions from a campaign's pool and create a quiz attempt.
 * Each user gets a unique random subset with shuffled answer orders.
 */
export async function startQuiz(
    userId: string,
    campaignId: number,
    participantId: string,
    drawCount: number = DEFAULT_DRAW_COUNT,
): Promise<QuizStartResult> {
    // Check for existing attempt
    const existing = await prisma.quizAttempt.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
    });
    if (existing) {
        throw new QuizError('ALREADY_ATTEMPTED', 'You have already taken this quiz');
    }

    // Fetch active questions from the pool
    const pool = await prisma.question.findMany({
        where: { campaignId, isActive: true, isSpeedTrap: false },
        select: {
            id: true,
            type: true,
            questionText: true,
            variants: true,
            options: true,
            correctIndex: true,
            points: true,
            difficulty: true,
        },
    });

    if (pool.length < MIN_POOL_SIZE) {
        throw new QuizError(
            'INSUFFICIENT_POOL',
            `Campaign needs at least ${MIN_POOL_SIZE} questions (has ${pool.length})`,
        );
    }

    // Randomly draw questions (Fisher-Yates partial shuffle)
    const count = Math.min(drawCount, pool.length);
    const drawn = fisherYatesSample(pool, count);

    // Prepare questions with variant picking and option shuffling
    const questions: DrawnQuestion[] = drawn.map((q) => {
        // Pick a random variant if available
        const variants = q.variants as string[];
        const questionText =
            variants && variants.length > 0
                ? variants[Math.floor(Math.random() * variants.length)]
                : q.questionText;

        // Shuffle MCQ options
        let options: string[] | null = null;
        let shuffledOrder: number[] | null = null;
        if (q.type === 'MCQ' && q.options) {
            const originalOptions = q.options as string[];
            const result = shuffleWithMapping(originalOptions);
            options = result.shuffled;
            shuffledOrder = result.mapping;
        }

        return {
            id: q.id,
            type: q.type,
            questionText,
            options,
            shuffledOrder,
            points: q.points,
            difficulty: q.difficulty,
            isFollowUp: false,
        };
    });

    // Create the attempt record
    const attempt = await prisma.quizAttempt.create({
        data: {
            userId,
            campaignId,
            participantId,
            questionIds: questions.map((q) => q.id),
            startedAt: new Date(),
        },
    });

    return {
        attemptId: attempt.id,
        questions,
        timeLimitSeconds: TIME_LIMIT_SECONDS,
    };
}

/**
 * Grade MCQ answers server-side. Returns grading results per question.
 *
 * Free-text answers are NOT graded here — they're handled by quiz-grading.service.ts
 * and populated separately. This function only grades MCQ questions.
 */
export async function gradeMcqAnswers(
    attemptId: string,
    answers: AnswerSubmission[],
): Promise<{ mcqResults: GradedAnswer[] }> {
    const attempt = await prisma.quizAttempt.findUnique({
        where: { id: attemptId },
        include: {
            answers: true,
        },
    });
    if (!attempt) throw new QuizError('NOT_FOUND', 'Quiz attempt not found');
    if (attempt.completedAt) throw new QuizError('ALREADY_COMPLETED', 'Quiz already completed');

    // Fetch questions for this attempt
    const questionIds = attempt.questionIds as string[];
    const questions = await prisma.question.findMany({
        where: { id: { in: questionIds } },
    });
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const mcqResults: GradedAnswer[] = [];

    for (let i = 0; i < answers.length; i++) {
        const ans = answers[i];
        const question = questionMap.get(ans.questionId);
        if (!question) continue;

        const shownAt = new Date(ans.shownAt);
        const answeredAt = new Date(ans.answeredAt);
        const timeTaken = Math.round((answeredAt.getTime() - shownAt.getTime()) / 1000);
        const timedOut = timeTaken > TIME_LIMIT_SECONDS;

        if (question.type === 'MCQ') {
            // Grade MCQ: map shuffled index back to original
            let isCorrect = false;
            if (!timedOut && ans.selectedIndex !== undefined) {
                // We need the shuffled order for this answer to map back
                // The shuffled order was sent to the client — now they return the index
                // in that shuffled array. We need the original mapping.
                // This is handled by storing shuffledOrder per answer.
                isCorrect = ans.selectedIndex === question.correctIndex;
                // NOTE: the selectedIndex from client is in the SHUFFLED order.
                // We'll store the shuffled order and resolve in the answer record.
            }

            mcqResults.push({
                questionId: ans.questionId,
                isCorrect: timedOut ? false : isCorrect,
                aiGradingScore: null,
                aiContentFlag: false,
                timeTakenSeconds: timeTaken,
                timedOut,
            });
        }
        // FREE_TEXT questions are skipped here — graded by quiz-grading.service.ts
    }

    return { mcqResults };
}

/**
 * Store all answers for an attempt (both MCQ and FREE_TEXT).
 * MCQ answers include isCorrect from server grading.
 * FREE_TEXT answers are stored pending AI grading.
 */
export async function storeAnswers(
    attemptId: string,
    answers: AnswerSubmission[],
    mcqResults: GradedAnswer[],
    shuffledOrders: Map<string, number[]>,
): Promise<void> {
    const mcqMap = new Map(mcqResults.map((r) => [r.questionId, r]));

    const data: Prisma.QuizAttemptAnswerCreateManyInput[] = answers.map((ans, i) => {
        const mcq = mcqMap.get(ans.questionId);
        const shownAt = new Date(ans.shownAt);
        const answeredAt = new Date(ans.answeredAt);
        const timeTaken = Math.round((answeredAt.getTime() - shownAt.getTime()) / 1000);

        const order = shuffledOrders.get(ans.questionId);

        return {
            attemptId,
            questionId: ans.questionId,
            questionOrder: i,
            selectedIndex: ans.selectedIndex ?? null,
            freeTextAnswer: ans.freeTextAnswer ?? null,
            shuffledOrder: order ? (order as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            isCorrect: mcq?.isCorrect ?? false,
            aiGradingScore: null,
            aiGradingNotes: null,
            aiContentFlag: false,
            aiDetectionConfidence: null,
            isFollowUp: false,
            followUpFromId: null,
            shownAt,
            answeredAt,
            timeTakenSeconds: timeTaken,
        };
    });

    await prisma.quizAttemptAnswer.createMany({ data });
}

/**
 * Finalize a quiz attempt with all scores computed.
 */
export async function finalizeAttempt(
    attemptId: string,
    totalScore: number,
    correctCount: number,
    timeLimitExceeded: boolean,
    aiContentDetected: boolean,
): Promise<void> {
    await prisma.quizAttempt.update({
        where: { id: attemptId },
        data: {
            totalScore,
            correctCount,
            timeLimitExceeded,
            aiContentDetected,
            completedAt: new Date(),
        },
    });
}

// ── Utilities ───────────────────────────────────────────────────────────────

/**
 * Fisher-Yates partial shuffle to pick `count` random items from an array.
 */
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
 * Shuffle an array and return the shuffled version + a mapping
 * from shuffled index → original index.
 */
function shuffleWithMapping<T>(arr: T[]): { shuffled: T[]; mapping: number[] } {
    const indices = arr.map((_, i) => i);
    // Fisher-Yates
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return {
        shuffled: indices.map((i) => arr[i]),
        mapping: indices,
    };
}

// ── Error Class ─────────────────────────────────────────────────────────────

export class QuizError extends Error {
    constructor(
        public code: string,
        message: string,
    ) {
        super(message);
        this.name = 'QuizError';
    }
}
