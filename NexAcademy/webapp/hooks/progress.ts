'use client';

interface ProgressData {
    completedLessons: number[];
    lastLesson: number;
}

/**
 * Get user's progress for a course from localStorage
 */
export async function getProgress(address: string, courseId: number): Promise<ProgressData | null> {
    if (typeof window === 'undefined') return null;

    const key = `safu_progress_${address.toLowerCase()}_${courseId}`;
    const stored = localStorage.getItem(key);

    if (stored) {
        try {
            return JSON.parse(stored) as ProgressData;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Update progress for a lesson completion
 */
export async function updateProgress(address: string, courseId: number, completedLessonIndex: number): Promise<void> {
    if (typeof window === 'undefined') return;

    const key = `safu_progress_${address.toLowerCase()}_${courseId}`;

    // Get existing progress
    const existing = await getProgress(address, courseId);
    const completedLessons = existing?.completedLessons || [];

    // Add lesson if not already completed
    if (!completedLessons.includes(completedLessonIndex)) {
        completedLessons.push(completedLessonIndex);
    }

    const progress: ProgressData = {
        completedLessons,
        lastLesson: completedLessonIndex,
    };

    localStorage.setItem(key, JSON.stringify(progress));
}

/**
 * Hook to use progress state reactively
 */
export function useProgress(address: string | undefined, courseId: number) {
    const getProgressData = async () => {
        if (!address) return null;
        return getProgress(address, courseId);
    };

    const saveProgress = async (lessonIndex: number) => {
        if (!address) return;
        await updateProgress(address, courseId, lessonIndex);
    };

    return { getProgressData, saveProgress };
}
