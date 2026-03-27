import { KillSwitchScope } from '@prisma/client';
import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Kill Switch Service
//
// Emergency controls for disabling features at global, campaign, or user level.
// Examples: disable all enrollments, pause a specific campaign, block a user.
// ─────────────────────────────────────────────────────────────────────────────

/** Well-known feature names for kill switches */
export const FEATURES = {
    ENROLLMENT: 'enrollment',
    COMPLETION: 'completion',
    REWARDS: 'rewards',
    PASSPORT_SCAN: 'passport_scan',
    BADGE_EVALUATION: 'badge_evaluation',
    ON_CHAIN_COMPLETION: 'on_chain_completion',
} as const;

export type FeatureName = (typeof FEATURES)[keyof typeof FEATURES];

/**
 * Check if a feature is killed at any applicable scope.
 * Checks in order: GLOBAL → CAMPAIGN → USER.
 * Returns true if the feature is BLOCKED (kill switch is active).
 */
export async function isKilled(
    feature: string,
    opts?: { campaignId?: number; userId?: string },
): Promise<boolean> {
    const now = new Date();

    const conditions: Array<{
        scope: KillSwitchScope;
        targetId: string | null;
        feature: string;
    }> = [
        { scope: 'GLOBAL', targetId: null, feature },
    ];

    if (opts?.campaignId !== undefined) {
        conditions.push({
            scope: 'CAMPAIGN',
            targetId: String(opts.campaignId),
            feature,
        });
    }

    if (opts?.userId) {
        conditions.push({
            scope: 'USER',
            targetId: opts.userId,
            feature,
        });
    }

    const activeSwitch = await prisma.killSwitch.findFirst({
        where: {
            AND: [
                { OR: conditions },
                { enabled: true },
                { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            ],
        },
        select: { id: true },
    });

    return !!activeSwitch;
}

/**
 * Activate a kill switch.
 */
export async function activateKillSwitch(params: {
    scope: KillSwitchScope;
    feature: string;
    targetId?: string;
    reason?: string;
    activatedBy?: string;
    expiresAt?: Date;
}): Promise<void> {
    await prisma.killSwitch.upsert({
        where: {
            scope_targetId_feature: {
                scope: params.scope,
                targetId: (params.targetId ?? null) as string,
                feature: params.feature,
            },
        },
        update: {
            enabled: true,
            reason: params.reason,
            activatedBy: params.activatedBy,
            activatedAt: new Date(),
            expiresAt: params.expiresAt ?? null,
        },
        create: {
            scope: params.scope,
            targetId: params.targetId ?? null,
            feature: params.feature,
            enabled: true,
            reason: params.reason,
            activatedBy: params.activatedBy,
            expiresAt: params.expiresAt ?? null,
        },
    });
}

/**
 * Deactivate a kill switch.
 */
export async function deactivateKillSwitch(
    scope: KillSwitchScope,
    feature: string,
    targetId?: string,
): Promise<void> {
    await prisma.killSwitch.updateMany({
        where: {
            scope,
            feature,
            targetId: targetId ?? null,
        },
        data: { enabled: false },
    });
}

/**
 * List all active kill switches (admin dashboard).
 */
export async function listActiveKillSwitches() {
    return prisma.killSwitch.findMany({
        where: {
            enabled: true,
            OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
            ],
        },
        orderBy: { activatedAt: 'desc' },
    });
}
