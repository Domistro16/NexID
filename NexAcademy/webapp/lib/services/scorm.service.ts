import { PrismaClient } from '@prisma/client';
import {
    calculateEngagementTimeScore,
    deriveScormMetrics,
    parseCourseDurationToSeconds,
    ScormState,
} from '../scorm/scoring';

export class ScormService {
    private prisma: PrismaClient;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    private async ensureEnrollment(userId: string, courseId: number) {
        const enrollment = await this.prisma.userCourse.findUnique({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
            include: {
                course: {
                    select: {
                        isIncentivized: true,
                        duration: true,
                    },
                },
            },
        });

        if (!enrollment) {
            throw new Error('Not enrolled in this course');
        }

        if (!enrollment.course.isIncentivized) {
            throw new Error('SCORM runtime is only available for incentivized courses');
        }

        return enrollment;
    }

    private sanitizeState(state: unknown): ScormState {
        if (!state || typeof state !== 'object') {
            return {};
        }

        const output: ScormState = {};
        for (const [key, value] of Object.entries(state as Record<string, unknown>)) {
            if (!key.startsWith('cmi.')) continue;
            if (value === null || value === undefined) continue;
            output[key] = String(value);
        }

        return output;
    }

    async initialize(userId: string, courseId: number) {
        await this.ensureEnrollment(userId, courseId);

        return this.prisma.scormRun.upsert({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
            create: {
                userId,
                courseId,
                cmiState: {},
                initializedAt: new Date(),
            },
            update: {
                initializedAt: new Date(),
            },
        });
    }

    async commit(userId: string, courseId: number, state: unknown) {
        const enrollment = await this.ensureEnrollment(userId, courseId);
        const incomingState = this.sanitizeState(state);

        const existing = await this.prisma.scormRun.findUnique({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
        });

        const mergedState: ScormState = {
            ...((existing?.cmiState as ScormState | null) || {}),
            ...incomingState,
        };

        const metrics = deriveScormMetrics(mergedState, existing?.totalTimeSeconds ?? 0);

        const runtime = await this.prisma.scormRun.upsert({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
            create: {
                userId,
                courseId,
                cmiState: mergedState,
                completionStatus: metrics.completionStatus,
                successStatus: metrics.successStatus,
                rawScore: metrics.rawScore,
                scaledScore: metrics.scaledScore,
                normalizedScore: metrics.quizScore,
                totalTimeSeconds: metrics.totalTimeSeconds,
                initializedAt: existing?.initializedAt ?? new Date(),
                lastCommitAt: new Date(),
            },
            update: {
                cmiState: mergedState,
                completionStatus: metrics.completionStatus,
                successStatus: metrics.successStatus,
                rawScore: metrics.rawScore,
                scaledScore: metrics.scaledScore,
                normalizedScore: metrics.quizScore,
                totalTimeSeconds: metrics.totalTimeSeconds,
                lastCommitAt: new Date(),
            },
        });

        const progressPercent = metrics.isCompleted
            ? 100
            : Math.min(
                  99,
                  calculateEngagementTimeScore(
                      metrics.totalTimeSeconds,
                      parseCourseDurationToSeconds(enrollment.course.duration)
                  )
              );

        await this.prisma.userCourse.update({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
            data: {
                progressPercent,
            },
        });

        return runtime;
    }

    async terminate(userId: string, courseId: number, state?: unknown) {
        await this.ensureEnrollment(userId, courseId);

        if (state) {
            await this.commit(userId, courseId, state);
        }

        return this.prisma.scormRun.update({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
            data: {
                terminatedAt: new Date(),
                lastCommitAt: new Date(),
            },
        });
    }

    async getRuntime(userId: string, courseId: number) {
        await this.ensureEnrollment(userId, courseId);
        return this.prisma.scormRun.findUnique({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
        });
    }
}
