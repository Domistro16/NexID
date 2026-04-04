import { AgentSessionType, AgentSessionStatus, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { calculateCompositeScore } from './scoring-composition.service';

// ─────────────────────────────────────────────────────────────────────────────
// Agent Session Service
//
// Strategy: "Never deploy agents as open-access features. Always schedule in
// fixed slots. Session token is single-use and wallet-bound. A wallet can only
// have one active session token per campaign."
//
// 8 use cases, priority ordered:
//   01. Campaign Assessment Session (top-N, 3-5 min, scored)
//   02. Chartered Credential Interview (top 0.5%, 8-10 min, scored)
//   03. Protocol Onboarding Concierge (B2B white-label)
//   04. Score Dispute Resolution (5 min, triggers review)
//   05. Live Social Engineering Simulation (security vertical)
//   06. Proof of Outcome Briefing (B2B, 10 min)
//   07. Campaign Discovery Concierge (2-3 min, homepage)
//   08. Pre-Quiz Q&A (30 min window, ungraded)
// ─────────────────────────────────────────────────────────────────────────────

/** Default max durations per session type (seconds) */
const DEFAULT_DURATIONS: Record<AgentSessionType, number> = {
    CAMPAIGN_ASSESSMENT: 300,       // 5 min
    CHARTERED_INTERVIEW: 600,       // 10 min
    PROTOCOL_ONBOARDING: 600,       // 10 min
    SCORE_DISPUTE: 300,             // 5 min
    SECURITY_SIMULATION: 600,       // 10 min
    PROOF_OF_OUTCOME_BRIEFING: 600, // 10 min
    CAMPAIGN_DISCOVERY: 180,        // 3 min
    PRE_QUIZ_QA: 1800,             // 30 min
};

/** Wallet challenge expiry in seconds */
const WALLET_CHALLENGE_EXPIRY_S = 30;

/** Session token expiry in milliseconds (90 seconds) */
const TOKEN_EXPIRY_MS = 90_000;

/** HMAC secret for signing session tokens — no hardcoded fallback */
const SESSION_SECRET: string = (() => {
    const secret = process.env.SESSION_TOKEN_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('SESSION_TOKEN_SECRET or JWT_SECRET must be configured');
    return secret;
})();

/** Session types that require scoring */
const SCORED_SESSION_TYPES = new Set<AgentSessionType>([
    'CAMPAIGN_ASSESSMENT',
    'CHARTERED_INTERVIEW',
    'SECURITY_SIMULATION',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Token generation — HMAC-signed with nonce + expiry
// ─────────────────────────────────────────────────────────────────────────────

function generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
}

function signSessionToken(sessionId: string, nonce: string, expiresAt: number): string {
    const payload = `${sessionId}:${nonce}:${expiresAt}`;
    const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    return `${payload}:${hmac}`;
}

function verifySessionToken(token: string, sessionId: string, nonce: string, expiresAt: number): boolean {
    const expected = signSessionToken(sessionId, nonce, expiresAt);
    if (token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export { verifySessionToken };

// ─────────────────────────────────────────────────────────────────────────────
// Slot management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the current active session count for a given type.
 */
async function getActiveSessionCount(
    sessionType: AgentSessionType,
): Promise<number> {
    return prisma.agentSession.count({
        where: {
            sessionType,
            status: { in: ['WALLET_CHALLENGE', 'ACTIVE'] },
        },
    });
}

/**
 * Get the slot config for a session type, with fallback defaults.
 */
async function getSlotConfig(sessionType: AgentSessionType) {
    const config = await prisma.agentSlotConfig.findUnique({
        where: { sessionType },
    });

    const rawMax = config?.maxConcurrent ?? 25;
    return {
        maxConcurrent: Math.min(25, Math.max(10, rawMax)),
        maxDurationSeconds:
            config?.maxDurationSeconds ?? DEFAULT_DURATIONS[sessionType],
        enabled: config?.enabled ?? true,
        topNEligible: config?.topNEligible ?? 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eligibility checks
// ─────────────────────────────────────────────────────────────────────────────

export interface EligibilityResult {
    eligible: boolean;
    reason?: string;
    queuePosition?: number;
    estimatedWaitMinutes?: number;
}

/**
 * Check if a user is eligible for a given agent session type.
 */
export async function checkEligibility(
    userId: string,
    sessionType: AgentSessionType,
    campaignId?: number,
): Promise<EligibilityResult> {
    const config = await getSlotConfig(sessionType);

    if (!config.enabled) {
        return { eligible: false, reason: 'This session type is currently disabled' };
    }

    // Check if user already has an active or completed session for this campaign+type
    const existing = await prisma.agentSession.findFirst({
        where: {
            userId,
            sessionType,
            campaignId: campaignId ?? null,
            status: { in: ['QUEUED', 'WALLET_CHALLENGE', 'ACTIVE', 'COMPLETED'] },
        },
    });

    const retryableFailedCompletedSession = Boolean(
        existing
        && existing.status === 'COMPLETED'
        && SCORED_SESSION_TYPES.has(existing.sessionType)
        && existing.overallScore === null,
    );

    if (existing?.status === 'COMPLETED' && !retryableFailedCompletedSession) {
        return { eligible: false, reason: 'You have already completed this session' };
    }
    if (existing && ['QUEUED', 'WALLET_CHALLENGE', 'ACTIVE'].includes(existing.status)) {
        return { eligible: false, reason: 'You already have an active session' };
    }

    // Top-N eligibility check for campaign assessment sessions
    if (config.topNEligible > 0 && campaignId) {
        const rank = await prisma.campaignParticipant.findUnique({
            where: {
                campaignId_userId: { campaignId, userId },
            },
            select: { rank: true },
        });

        if (!rank?.rank || rank.rank > config.topNEligible) {
            return {
                eligible: false,
                reason: `Only the top ${config.topNEligible} participants are eligible`,
            };
        }
    }

    // Chartered interview: must have 3+ completed assessment sessions
    if (sessionType === 'CHARTERED_INTERVIEW') {
        const assessmentCount = await prisma.agentSession.count({
            where: {
                userId,
                sessionType: 'CAMPAIGN_ASSESSMENT',
                status: 'COMPLETED',
                overallScore: { gte: 60 },
            },
        });
        if (assessmentCount < 3) {
            return {
                eligible: false,
                reason: 'Chartered interview requires 3+ passed campaign assessment sessions',
            };
        }
    }

    // Check queue position
    const activeCount = await getActiveSessionCount(sessionType);
    if (activeCount >= config.maxConcurrent) {
        const queuedCount = await prisma.agentSession.count({
            where: { sessionType, status: 'QUEUED' },
        });
        const position = queuedCount + 1;
        // Estimate: each batch of maxConcurrent clears in ~avgDuration
        const avgDurationMinutes = config.maxDurationSeconds / 60;
        const batchesAhead = Math.ceil(position / config.maxConcurrent);
        const estimatedWaitMinutes = Math.round(batchesAhead * avgDurationMinutes);
        return {
            eligible: true,
            queuePosition: position,
            estimatedWaitMinutes,
        };
    }

    return { eligible: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request an agent session slot. Creates a QUEUED session.
 * Returns the session token needed to start the session.
 */
export async function requestSession(
    userId: string,
    sessionType: AgentSessionType,
    campaignId?: number,
): Promise<{
    sessionId: string;
    sessionToken: string;
    queuePosition: number | null;
    scheduledAt: Date | null;
}> {
    const eligibility = await checkEligibility(userId, sessionType, campaignId);
    if (!eligibility.eligible) {
        throw new Error(eligibility.reason ?? 'Not eligible for this session');
    }

    const config = await getSlotConfig(sessionType);
    const activeCount = await getActiveSessionCount(sessionType);
    const isImmediate = activeCount < config.maxConcurrent;

    // Delete any stale sessions so the unique(userId, campaignId, sessionType) constraint
    // does not block creating a fresh one. Only non-terminal sessions are preserved.
    await prisma.agentSession.deleteMany({
        where: {
            userId,
            sessionType,
            campaignId: campaignId ?? null,
            OR: [
                { status: { in: ['EXPIRED', 'CANCELLED'] } },
                ...(SCORED_SESSION_TYPES.has(sessionType)
                    ? [{ status: AgentSessionStatus.COMPLETED, overallScore: null }]
                    : []),
            ],
        },
    });

    // Generate signed token with nonce + 90s expiry
    const nonce = generateNonce();
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
    const tokenExpiresAt = new Date(expiresAt);

    // Create session first to get the ID, then sign the token
    const session = await prisma.agentSession.create({
        data: {
            userId,
            campaignId: campaignId ?? null,
            sessionType,
            sessionToken: crypto.randomBytes(32).toString('hex'), // placeholder
            nonce,
            tokenExpiresAt,
            status: isImmediate ? 'WALLET_CHALLENGE' : 'QUEUED',
            challengeIssuedAt: isImmediate ? new Date() : null,
            queuePosition: isImmediate ? null : (eligibility.queuePosition ?? 1),
            maxDurationSeconds: config.maxDurationSeconds,
        },
    });

    // Sign the token with session ID + nonce + expiry
    const sessionToken = signSessionToken(session.id, nonce, expiresAt);

    // Update with signed token
    await prisma.agentSession.update({
        where: { id: session.id },
        data: { sessionToken },
    });

    return {
        sessionId: session.id,
        sessionToken,
        queuePosition: isImmediate ? null : session.queuePosition,
        scheduledAt: session.scheduledAt,
    };
}

/**
 * Start an agent session after wallet signature verification.
 * Transitions from WALLET_CHALLENGE → ACTIVE.
 *
 * Strategy: "Session start requires a fresh wallet signature within 30 seconds"
 */
export async function startSession(
    sessionToken: string,
    walletSignature: string,
): Promise<{
    sessionId: string;
    agentConfig: {
        sessionType: AgentSessionType;
        maxDurationSeconds: number;
        campaignId: number | null;
        userId: string;
    };
}> {
    const session = await prisma.agentSession.findUnique({
        where: { sessionToken },
    });

    if (!session) {
        throw new Error('Invalid session token');
    }

    if (session.status !== 'WALLET_CHALLENGE') {
        throw new Error(
            session.status === 'QUEUED'
                ? 'Session is still in queue'
                : `Session is in ${session.status} state`,
        );
    }

    // Verify signed token with HMAC (nonce + expiry)
    if (session.nonce && session.tokenExpiresAt) {
        const expiresAt = session.tokenExpiresAt.getTime();
        if (!verifySessionToken(sessionToken, session.id, session.nonce, expiresAt)) {
            throw new Error('Invalid session token signature');
        }
        if (Date.now() > expiresAt) {
            await prisma.agentSession.update({
                where: { id: session.id },
                data: { status: 'EXPIRED' },
            });
            throw new Error('Session token expired. Request a new session.');
        }
    }

    // Null the nonce to prevent replay (409 on second use)
    if (!session.nonce) {
        throw new Error('Session token already used');
    }

    // Verify wallet challenge hasn't expired (30 seconds)
    if (session.challengeIssuedAt) {
        const elapsed =
            (Date.now() - session.challengeIssuedAt.getTime()) / 1000;
        if (elapsed > WALLET_CHALLENGE_EXPIRY_S) {
            await prisma.agentSession.update({
                where: { id: session.id },
                data: { status: 'EXPIRED' },
            });
            throw new Error('Wallet challenge expired. Request a new session.');
        }
    }

    // Atomic nonce nullification: only the first request wins.
    // The WHERE clause ensures two concurrent requests can't both succeed.
    const nonceConsumed = await prisma.$executeRaw`
        UPDATE "AgentSession"
        SET "nonce" = NULL
        WHERE "id" = ${session.id} AND "nonce" = ${session.nonce}
    `;
    if (nonceConsumed === 0) {
        throw new Error('Session token already used (concurrent request detected)');
    }

    // Enforce one active session per wallet
    const otherActive = await prisma.agentSession.findFirst({
        where: {
            userId: session.userId,
            status: 'ACTIVE',
            id: { not: session.id },
        },
    });
    if (otherActive) {
        // Close the other session (strategy: "second request closes the first")
        await prisma.agentSession.update({
            where: { id: otherActive.id },
            data: { status: 'CANCELLED' },
        });
    }

    const updated = await prisma.agentSession.update({
        where: { id: session.id },
        data: {
            status: 'ACTIVE',
            walletSignature,
            startedAt: new Date(),
        },
    });

    return {
        sessionId: updated.id,
        agentConfig: {
            sessionType: updated.sessionType,
            maxDurationSeconds: updated.maxDurationSeconds,
            campaignId: updated.campaignId,
            userId: updated.userId,
        },
    };
}

/**
 * Complete an agent session with scoring data.
 * Called by the server after the Gemini Live session ends.
 */
export async function completeSession(
    sessionId: string,
    data: {
        providerSessionId?: string;
        durationSeconds: number;
        depthScore?: number;
        accuracyScore?: number;
        originalityScore?: number;
        overallScore?: number;
        scoringNotes?: Record<string, unknown>;
        transcript?: Record<string, unknown>[];
        // HCS fields
        humanConfidenceScore?: number;
        responseLatencyAvg?: number;
        semanticCorrectionScore?: number;
        naturalDisfluencyScore?: number;
        answerCoherenceScore?: number;
    },
): Promise<{ sessionId: string; overallScore: number | null }> {
    const session = await prisma.agentSession.findUnique({
        where: { id: sessionId },
    });

    if (!session) {
        throw new Error('Session not found');
    }
    if (session.status !== 'ACTIVE') {
        throw new Error(`Session is not active (status: ${session.status})`);
    }

    const isScored = SCORED_SESSION_TYPES.has(session.sessionType);

    // Merge HCS data into scoringNotes
    const hcs = (data.humanConfidenceScore != null) ? {
        responseLatency: data.responseLatencyAvg,
        semanticCorrection: data.semanticCorrectionScore,
        naturalDisfluency: data.naturalDisfluencyScore,
        answerCoherence: data.answerCoherenceScore,
        humanConfidenceScore: data.humanConfidenceScore,
    } : undefined;

    const scoringNotes: Record<string, unknown> = {
        ...(data.scoringNotes ?? {}),
        ...(hcs ? { hcs } : {}),
    };

    const updated = await prisma.agentSession.update({
        where: { id: sessionId },
        data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            providerSessionId: data.providerSessionId,
            durationSeconds: data.durationSeconds,
            depthScore: isScored ? data.depthScore : null,
            accuracyScore: isScored ? data.accuracyScore : null,
            originalityScore: isScored ? data.originalityScore : null,
            overallScore: isScored ? data.overallScore : null,
            scoringNotes: (Object.keys(scoringNotes).length > 0 ? scoringNotes : undefined) as Prisma.InputJsonValue | undefined,
            transcript: (data.transcript as Prisma.InputJsonValue) ?? undefined,
        },
    });

    // If scored and passed, trigger badge evaluation
    if (isScored && (updated.overallScore ?? 0) >= 60) {
        const { evaluateBadges } = await import('./badge-engine.service');
        evaluateBadges(session.userId).catch((err) =>
            console.error('[AgentSession] badge evaluation failed:', err),
        );
    }

    if (updated.sessionType === 'CAMPAIGN_ASSESSMENT' && updated.campaignId && updated.overallScore != null) {
        const participant = await prisma.campaignParticipant.findUnique({
            where: {
                campaignId_userId: {
                    campaignId: updated.campaignId,
                    userId: updated.userId,
                },
            },
            select: {
                videoScore: true,
                quizScore: true,
                onchainScore: true,
            },
        });

        if (participant) {
            const composite = calculateCompositeScore({
                videoScore: participant.videoScore ?? 0,
                quizScore: participant.quizScore ?? 0,
                onchainScore: participant.onchainScore ?? 0,
                agentScore: updated.overallScore,
            });

            await prisma.campaignParticipant.update({
                where: {
                    campaignId_userId: {
                        campaignId: updated.campaignId,
                        userId: updated.userId,
                    },
                },
                data: {
                    agentScore: updated.overallScore,
                    compositeScore: composite.compositeScore,
                },
            });
        }
    }

    // Promote next queued session for this type
    promoteNextQueued(session.sessionType).catch((err) =>
        console.error('[AgentSession] queue promotion failed:', err),
    );

    return {
        sessionId: updated.id,
        overallScore: updated.overallScore,
    };
}

/**
 * Cancel/expire a session.
 */
export async function cancelSession(sessionId: string): Promise<void> {
    const session = await prisma.agentSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, sessionType: true },
    });

    if (!session) throw new Error('Session not found');

    if (['COMPLETED', 'CANCELLED'].includes(session.status)) {
        return; // Already terminal
    }

    await prisma.agentSession.update({
        where: { id: sessionId },
        data: { status: 'CANCELLED' },
    });

    promoteNextQueued(session.sessionType).catch((err) =>
        console.error('[AgentSession] queue promotion failed:', err),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Promote the next queued session to WALLET_CHALLENGE when a slot opens.
 */
async function promoteNextQueued(
    sessionType: AgentSessionType,
): Promise<void> {
    const config = await getSlotConfig(sessionType);
    const activeCount = await getActiveSessionCount(sessionType);

    if (activeCount >= config.maxConcurrent) return;

    const slotsAvailable = config.maxConcurrent - activeCount;

    const queued = await prisma.agentSession.findMany({
        where: { sessionType, status: 'QUEUED' },
        orderBy: { createdAt: 'asc' },
        take: slotsAvailable,
    });

    for (const session of queued) {
        await prisma.agentSession.update({
            where: { id: session.id },
            data: {
                status: 'WALLET_CHALLENGE',
                challengeIssuedAt: new Date(),
                queuePosition: null,
            },
        });
    }
}

/**
 * Get the queue status for a session type.
 */
export async function getQueueStatus(sessionType: AgentSessionType) {
    const [config, activeCount, queuedCount] = await Promise.all([
        getSlotConfig(sessionType),
        getActiveSessionCount(sessionType),
        prisma.agentSession.count({
            where: { sessionType, status: 'QUEUED' },
        }),
    ]);

    const avgDuration = DEFAULT_DURATIONS[sessionType];
    const estimatedWaitMinutes =
        queuedCount > 0
            ? Math.ceil(
                  (queuedCount * avgDuration) /
                      (config.maxConcurrent * 60),
              )
            : 0;

    return {
        sessionType,
        enabled: config.enabled,
        activeSessions: activeCount,
        maxConcurrent: config.maxConcurrent,
        queuedCount,
        estimatedWaitMinutes,
        slotsAvailable: Math.max(0, config.maxConcurrent - activeCount),
    };
}

/**
 * Get a user's agent sessions (for profile/dashboard).
 */
export async function getUserSessions(userId: string) {
    return prisma.agentSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            sessionType: true,
            status: true,
            campaignId: true,
            overallScore: true,
            depthScore: true,
            accuracyScore: true,
            originalityScore: true,
            durationSeconds: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
        },
    });
}

/**
 * Expire stale sessions (wallet challenge timeout or active session timeout).
 * Called by a cron job.
 */
export async function expireStaleSessions(): Promise<number> {
    const now = new Date();

    // Expire wallet challenges older than 30 seconds
    const challengeExpiry = new Date(
        now.getTime() - WALLET_CHALLENGE_EXPIRY_S * 1000,
    );
    const expiredChallenges = await prisma.agentSession.updateMany({
        where: {
            status: 'WALLET_CHALLENGE',
            challengeIssuedAt: { lt: challengeExpiry },
        },
        data: { status: 'EXPIRED' },
    });

    // Expire active sessions past their max duration (with 60s grace)
    const expiredActive = await prisma.$executeRaw`
        UPDATE "AgentSession"
        SET "status" = 'EXPIRED'::"AgentSessionStatus", "updatedAt" = NOW()
        WHERE "status" = 'ACTIVE'
          AND "startedAt" IS NOT NULL
          AND "startedAt" + ("maxDurationSeconds" + 60) * INTERVAL '1 second' < NOW()
    `;

    const totalExpired = expiredChallenges.count + expiredActive;

    // Promote queued sessions for all types that had expirations
    if (totalExpired > 0) {
        const types: AgentSessionType[] = [
            'CAMPAIGN_ASSESSMENT',
            'CHARTERED_INTERVIEW',
            'PROTOCOL_ONBOARDING',
            'SCORE_DISPUTE',
            'SECURITY_SIMULATION',
            'PROOF_OF_OUTCOME_BRIEFING',
            'CAMPAIGN_DISCOVERY',
            'PRE_QUIZ_QA',
        ];
        for (const type of types) {
            await promoteNextQueued(type);
        }
    }

    return totalExpired;
}
