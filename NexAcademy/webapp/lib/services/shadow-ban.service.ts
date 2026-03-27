import { SybilFlagReason, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Shadow-Ban Service
//
// Strategy: "Shadow-ban (score to zero silently) rather than hard-block —
// prevents detection arms race."
//
// Shadow-banned users continue to use the platform normally but their
// campaign scores are silently zeroed. They receive no notification.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a user is currently shadow-banned.
 */
export async function isShadowBanned(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { shadowBanned: true },
    });
    return user?.shadowBanned ?? false;
}

/**
 * Apply shadow-ban to a user. Silently zeros all future scores.
 *
 * Optionally creates a sybil flag record with the reason.
 */
export async function applyShadowBan(
    userId: string,
    reason: SybilFlagReason,
    evidence?: Record<string, unknown>,
): Promise<void> {
    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: { shadowBanned: true },
        }),
        prisma.sybilFlag.create({
            data: {
                userId,
                reason,
                severity: 5,
                evidence: (evidence ?? {}) as Prisma.InputJsonValue,
            },
        }),
    ]);
}

/**
 * Lift a shadow-ban (admin action after review).
 */
export async function liftShadowBan(userId: string): Promise<void> {
    await prisma.user.update({
        where: { id: userId },
        data: { shadowBanned: false },
    });
}

/**
 * Flag a user for AI-generated content and apply shadow-ban.
 * Called when the AI detection signal fires on a free-text submission.
 */
export async function flagAiContent(
    userId: string,
    campaignId: number,
    details: {
        field: string;
        confidence: number;
        snippet?: string;
    },
): Promise<void> {
    await applyShadowBan(userId, 'AI_GENERATED_CONTENT', {
        campaignId,
        ...details,
    });
}

/**
 * Apply shadow-ban score modifier.
 * Returns 0 if the user is shadow-banned, otherwise returns the original score.
 *
 * This is the function that should be called in the scoring pipeline.
 */
export function applyShadowBanModifier(
    score: number,
    shadowBanned: boolean,
): number {
    return shadowBanned ? 0 : score;
}
