export type ScormState = Record<string, string>;

const SCORM_12_COMPLETED = new Set(['completed', 'passed', 'failed']);
const SCORM_12_SUCCESS = new Set(['passed']);
const SCORM_12_FAILED = new Set(['failed']);

const SCORM_2004_COMPLETED = new Set(['completed']);
const SCORM_2004_SUCCESS = new Set(['passed']);
const SCORM_2004_FAILED = new Set(['failed']);

export interface ScormDerivedMetrics {
    completionStatus: string;
    successStatus: string;
    isCompleted: boolean;
    isSuccessful: boolean;
    quizScore: number | null;
    rawScore: number | null;
    scaledScore: number | null;
    totalTimeSeconds: number;
}

export function parseScorm12TimeToSeconds(value: string): number {
    if (!value) return 0;
    const match = value.trim().match(/^(\d{1,4}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
    if (!match) return 0;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);

    if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
        return 0;
    }

    return hours * 3600 + minutes * 60 + seconds;
}

export function parseScorm2004DurationToSeconds(value: string): number {
    if (!value) return 0;
    const match = value.trim().match(
        /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
    );

    if (!match) return 0;

    const days = Number(match[1] ?? '0');
    const hours = Number(match[2] ?? '0');
    const minutes = Number(match[3] ?? '0');
    const seconds = Number(match[4] ?? '0');

    if ([days, hours, minutes, seconds].some((unit) => Number.isNaN(unit))) {
        return 0;
    }

    return Math.floor(days * 86400 + hours * 3600 + minutes * 60 + seconds);
}

export function parseScormTimeToSeconds(value: string): number {
    if (!value) return 0;
    if (value.startsWith('P')) {
        return parseScorm2004DurationToSeconds(value);
    }
    return parseScorm12TimeToSeconds(value);
}

function toNumber(value?: string | null): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return null;
    return parsed;
}

function normalizeRawScore(raw: number, min: number | null, max: number | null): number {
    const low = min ?? 0;
    const high = max ?? 100;
    if (high <= low) {
        return Math.max(0, Math.min(100, Math.round(raw)));
    }

    const normalized = ((raw - low) / (high - low)) * 100;
    return Math.max(0, Math.min(100, Math.round(normalized)));
}

function deriveCompletion(state: ScormState): {
    completionStatus: string;
    successStatus: string;
    isCompleted: boolean;
    isSuccessful: boolean;
} {
    const lessonStatus = (state['cmi.core.lesson_status'] || '').toLowerCase();
    const completionStatus2004 = (state['cmi.completion_status'] || '').toLowerCase();
    const successStatus2004 = (state['cmi.success_status'] || '').toLowerCase();

    if (lessonStatus) {
        return {
            completionStatus: SCORM_12_COMPLETED.has(lessonStatus) ? 'completed' : 'incomplete',
            successStatus: SCORM_12_SUCCESS.has(lessonStatus)
                ? 'passed'
                : SCORM_12_FAILED.has(lessonStatus)
                ? 'failed'
                : 'unknown',
            isCompleted: SCORM_12_COMPLETED.has(lessonStatus),
            isSuccessful: SCORM_12_SUCCESS.has(lessonStatus),
        };
    }

    const completed = SCORM_2004_COMPLETED.has(completionStatus2004) || SCORM_2004_SUCCESS.has(successStatus2004) || SCORM_2004_FAILED.has(successStatus2004);

    return {
        completionStatus: completionStatus2004 || (completed ? 'completed' : 'incomplete'),
        successStatus: successStatus2004 || 'unknown',
        isCompleted: completed,
        isSuccessful: SCORM_2004_SUCCESS.has(successStatus2004),
    };
}

function deriveQuizScore(state: ScormState, isCompleted: boolean): {
    quizScore: number | null;
    rawScore: number | null;
    scaledScore: number | null;
} {
    if (!isCompleted) {
        return { quizScore: null, rawScore: null, scaledScore: null };
    }

    const rawScore12 = toNumber(state['cmi.core.score.raw']);
    const minScore12 = toNumber(state['cmi.core.score.min']);
    const maxScore12 = toNumber(state['cmi.core.score.max']);

    const rawScore2004 = toNumber(state['cmi.score.raw']);
    const minScore2004 = toNumber(state['cmi.score.min']);
    const maxScore2004 = toNumber(state['cmi.score.max']);

    const scaled = toNumber(state['cmi.score.scaled']);

    if (rawScore12 !== null) {
        return {
            quizScore: normalizeRawScore(rawScore12, minScore12, maxScore12),
            rawScore: rawScore12,
            scaledScore: null,
        };
    }

    if (rawScore2004 !== null) {
        return {
            quizScore: normalizeRawScore(rawScore2004, minScore2004, maxScore2004),
            rawScore: rawScore2004,
            scaledScore: scaled,
        };
    }

    if (scaled !== null) {
        return {
            quizScore: Math.max(0, Math.min(100, Math.round(scaled * 100))),
            rawScore: null,
            scaledScore: scaled,
        };
    }

    return {
        quizScore: null,
        rawScore: null,
        scaledScore: null,
    };
}

function deriveTotalTimeSeconds(state: ScormState, previousTotalSeconds: number): number {
    const totalTime = state['cmi.total_time'] || state['cmi.core.total_time'];
    const sessionTime = state['cmi.session_time'] || state['cmi.core.session_time'];

    const parsedTotal = totalTime ? parseScormTimeToSeconds(totalTime) : 0;
    const parsedSession = sessionTime ? parseScormTimeToSeconds(sessionTime) : 0;
    const bestObserved = Math.max(parsedTotal, parsedSession);

    return Math.max(previousTotalSeconds, bestObserved);
}

export function deriveScormMetrics(
    state: ScormState,
    previousTotalSeconds = 0
): ScormDerivedMetrics {
    const completion = deriveCompletion(state);
    const score = deriveQuizScore(state, completion.isCompleted || completion.isSuccessful);
    const totalTimeSeconds = deriveTotalTimeSeconds(state, previousTotalSeconds);

    return {
        completionStatus: completion.completionStatus,
        successStatus: completion.successStatus,
        isCompleted: completion.isCompleted,
        isSuccessful: completion.isSuccessful,
        quizScore: score.quizScore,
        rawScore: score.rawScore,
        scaledScore: score.scaledScore,
        totalTimeSeconds,
    };
}

export function parseCourseDurationToSeconds(duration: string): number | null {
    if (!duration) return null;

    const lower = duration.toLowerCase();
    const matches = Array.from(lower.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hour|hours|m|min|minute|minutes|s|sec|second|seconds)/g));
    if (matches.length === 0) return null;

    let totalSeconds = 0;
    for (const match of matches) {
        const value = Number(match[1]);
        const unit = match[2];
        if (Number.isNaN(value)) continue;

        if (unit.startsWith('h')) {
            totalSeconds += Math.round(value * 3600);
        } else if (unit.startsWith('m')) {
            totalSeconds += Math.round(value * 60);
        } else {
            totalSeconds += Math.round(value);
        }
    }

    return totalSeconds > 0 ? totalSeconds : null;
}

export function calculateEngagementTimeScore(totalTimeSeconds: number, courseDurationSeconds: number | null): number {
    if (!courseDurationSeconds || courseDurationSeconds <= 0) {
        return totalTimeSeconds > 0 ? 100 : 0;
    }

    const ratio = Math.max(0, Math.min(1, totalTimeSeconds / courseDurationSeconds));
    return Math.round(ratio * 100);
}

export function calculateBaseScore(quizScore: number, engagementTimeScore: number): number {
    const value = 0.7 * quizScore + 0.3 * engagementTimeScore;
    return Math.max(0, Math.min(100, Math.round(value)));
}

export function getActionBoostMultiplier(proofSigned: boolean, dappVisit: boolean): number {
    let multiplier = 1;
    if (proofSigned) multiplier *= 1.1;
    if (dappVisit) multiplier *= 1.03;
    return multiplier;
}

export function calculateFinalScore(baseScore: number, actionMultiplier: number, idMultiplier = 1): number {
    const value = baseScore * actionMultiplier * idMultiplier;
    return Math.max(0, Math.min(100, Math.round(value)));
}

export enum CompletionFlag {
    ProofSigned = 1,
    DappVisit = 2,
    ScormCompleted = 4,
    Incentivized = 8,
}

export function buildCompletionFlags(proofSigned: boolean, dappVisit: boolean, scormCompleted: boolean): number {
    let flags = CompletionFlag.Incentivized;
    if (proofSigned) flags |= CompletionFlag.ProofSigned;
    if (dappVisit) flags |= CompletionFlag.DappVisit;
    if (scormCompleted) flags |= CompletionFlag.ScormCompleted;
    return flags;
}

export function isScormCompleted(completionStatus?: string | null, successStatus?: string | null): boolean {
    const completion = (completionStatus || '').toLowerCase();
    const success = (successStatus || '').toLowerCase();
    return completion === 'completed' || success === 'passed' || success === 'failed';
}

