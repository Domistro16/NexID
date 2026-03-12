// Points configuration based on course level

export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced';

interface PointsConfig {
    watchPoints: number;      // Points for watching lesson (50%+ threshold)
    quizPoints: number;       // Points for passing quiz
    completionBonus: number;  // Bonus for completing entire course
}

const POINTS_BY_LEVEL: Record<CourseLevel, PointsConfig> = {
    Beginner: {
        watchPoints: 10,
        quizPoints: 10,
        completionBonus: 50,
    },
    Intermediate: {
        watchPoints: 15,
        quizPoints: 15,
        completionBonus: 75,
    },
    Advanced: {
        watchPoints: 20,
        quizPoints: 20,
        completionBonus: 100,
    },
};

// Default points for courses without a level
const DEFAULT_POINTS: PointsConfig = POINTS_BY_LEVEL.Beginner;

/**
 * Get points configuration based on course level
 */
export function getPointsConfig(level: string | null | undefined): PointsConfig {
    if (!level) return DEFAULT_POINTS;

    const normalizedLevel = level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();

    if (normalizedLevel in POINTS_BY_LEVEL) {
        return POINTS_BY_LEVEL[normalizedLevel as CourseLevel];
    }

    return DEFAULT_POINTS;
}

/**
 * Watch threshold percentage (50%)
 */
export const WATCH_THRESHOLD_PERCENT = 50;
