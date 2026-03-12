import { PrismaClient, CourseLevel } from '@prisma/client';

interface Course {
    id: number;
    title: string;
    description: string;
    category: string;
    level: CourseLevel;
    isPublished: boolean;
    createdAt: Date;
    instructor: string | null;
    thumbnailUrl: string | null;
    duration: string | null;
    completionPoints: number;
    _count?: {
        lessons: number;
    };
}

interface UserCourseWithCourse {
    courseId: number;
    isCompleted: boolean;
    course: Course | null;
}

export class RecommendationService {
    private prisma: PrismaClient;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    /**
     * Get featured courses for a user based on their preferences and history.
     * Falls back to popular/newest courses for unauthenticated or new users.
     */
    async getFeaturedCourses(userId?: string, limit: number = 3): Promise<Course[]> {
        // Try personalized recommendations first
        if (userId) {
            const personalized = await this.getPersonalizedCourses(userId, limit);
            if (personalized.length >= limit) {
                return personalized;
            }

            // Fill remaining slots with popular/new courses
            const remaining = limit - personalized.length;
            const excludeIds = personalized.map(c => c.id);
            const fallback = await this.getFallbackCourses(remaining, excludeIds);
            return [...personalized, ...fallback];
        }

        // Fallback for unauthenticated users
        return this.getFallbackCourses(limit);
    }

    /**
     * Get personalized course recommendations based on user history.
     */
    private async getPersonalizedCourses(userId: string, limit: number): Promise<Course[]> {
        // Get user's watched/completed courses to find preferred categories
        const userCourses = await this.prisma.userCourse.findMany({
            where: { userId },
            include: { course: true },
        });

        if (userCourses.length === 0) {
            return []; // No history, use fallback
        }

        // Extract preferred categories from user's history
        const categoryCount: Record<string, number> = {};
        const completedCourseIds = new Set<number>();

        for (const uc of userCourses) {
            if (uc.course) {
                const category = uc.course.category;
                categoryCount[category] = (categoryCount[category] || 0) + 1;
                if (uc.isCompleted) {
                    completedCourseIds.add(uc.courseId);
                }
            }
        }

        // Sort categories by frequency
        const preferredCategories = Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1])
            .map(([category]) => category);

        // Get user's current skill level (based on completed course levels)
        const completedLevels: CourseLevel[] = userCourses
            .filter((uc: UserCourseWithCourse) => uc.isCompleted && uc.course)
            .map((uc: UserCourseWithCourse) => uc.course!.level);

        const levelPriority = this.getNextLevelPriority(completedLevels);

        // Find courses in preferred categories, excluding already enrolled/completed
        const enrolledCourseIds = userCourses.map((uc: UserCourseWithCourse) => uc.courseId);

        const recommendedCourses = await this.prisma.course.findMany({
            where: {
                isPublished: true,
                id: { notIn: enrolledCourseIds },
                OR: [
                    // Preferred categories
                    { category: { in: preferredCategories.slice(0, 3) } },
                    // Next skill level
                    { level: { in: levelPriority } },
                ],
            },
            include: {
                _count: {
                    select: { lessons: true },
                },
            },
            orderBy: [
                // Prioritize by enrollment count (popularity)
                { enrollments: { _count: 'desc' } },
            ],
            take: limit,
        });

        return recommendedCourses;
    }

    /**
     * Get fallback courses (popular and newest) for users without history.
     */
    private async getFallbackCourses(limit: number, excludeIds: number[] = []): Promise<Course[]> {
        // Mix of popular and new courses
        const popularLimit = Math.ceil(limit / 2);
        const newestLimit = limit - popularLimit;

        // Get most popular courses (by enrollment count)
        const popular = await this.prisma.course.findMany({
            where: {
                isPublished: true,
                id: { notIn: excludeIds },
            },
            include: {
                _count: {
                    select: { lessons: true },
                },
            },
            orderBy: { enrollments: { _count: 'desc' } },
            take: popularLimit,
        });

        const popularIds = popular.map((c: Course) => c.id);
        const allExcludeIds = [...excludeIds, ...popularIds];

        // Get newest courses
        const newest = await this.prisma.course.findMany({
            where: {
                isPublished: true,
                id: { notIn: allExcludeIds },
            },
            include: {
                _count: {
                    select: { lessons: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: newestLimit,
        });

        return [...popular, ...newest];
    }

    /**
     * Determine the next skill level priority based on completed levels.
     */
    private getNextLevelPriority(completedLevels: CourseLevel[]): CourseLevel[] {
        const levelOrder: CourseLevel[] = [CourseLevel.BEGINNER, CourseLevel.INTERMEDIATE, CourseLevel.ADVANCED];

        if (completedLevels.length === 0) {
            return [CourseLevel.BEGINNER, CourseLevel.INTERMEDIATE];
        }

        // Find highest completed level
        let highestIndex = -1;
        for (const level of completedLevels) {
            const idx = levelOrder.indexOf(level);
            if (idx > highestIndex) {
                highestIndex = idx;
            }
        }

        // Recommend current level and next level
        const priorities: CourseLevel[] = [];
        if (highestIndex >= 0 && highestIndex < levelOrder.length) {
            priorities.push(levelOrder[highestIndex]);
        }
        if (highestIndex + 1 < levelOrder.length) {
            priorities.push(levelOrder[highestIndex + 1]);
        }

        return priorities.length > 0 ? priorities : [CourseLevel.BEGINNER, CourseLevel.INTERMEDIATE];
    }
}
