import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Engagement Integrity Service
//
// Server-side validation for video heartbeat signals, tab focus tracking,
// and mouse movement entropy. Detects automated/bot engagement patterns.
//
// Strategy: "Heartbeat timing must be randomised within a realistic human
// variance window (±15–30% jitter). Tab focus detection: video pauses and
// logs a flag when the tab loses focus."
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Heartbeat jitter validation
// ─────────────────────────────────────────────────────────────────────────────

/** Expected heartbeat interval in ms (what the client should send) */
const EXPECTED_HEARTBEAT_INTERVAL_MS = 10_000;

/** Maximum acceptable jitter (upper bound: 30% of interval) */
const JITTER_TOLERANCE = 0.30;

/** Minimum required jitter (lower bound: 15% of interval) — heartbeats with less jitter than this are suspiciously uniform */
const MIN_JITTER = 0.15;

/** Minimum number of heartbeats to analyse */
const MIN_HEARTBEATS_FOR_ANALYSIS = 5;

/** Maximum coefficient of variation for human-like timing (bots are too regular) */
const MAX_REGULARITY_CV = 0.03;

export interface HeartbeatAnalysis {
    isHumanLike: boolean;
    heartbeatCount: number;
    meanIntervalMs: number;
    coefficientOfVariation: number;
    anomalies: string[];
}

/**
 * Analyse heartbeat timestamps for bot-like regularity.
 * Human heartbeats have natural jitter; bot heartbeats are mechanically precise.
 *
 * @param timestamps Array of heartbeat timestamps in ms (ascending order)
 */
export function analyseHeartbeats(timestamps: number[]): HeartbeatAnalysis {
    const anomalies: string[] = [];

    if (timestamps.length < MIN_HEARTBEATS_FOR_ANALYSIS) {
        return {
            isHumanLike: true, // Not enough data to flag
            heartbeatCount: timestamps.length,
            meanIntervalMs: 0,
            coefficientOfVariation: 0,
            anomalies: [],
        };
    }

    // Calculate intervals between consecutive heartbeats
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    // Mean interval
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Standard deviation
    const variance =
        intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        intervals.length;
    const stdDev = Math.sqrt(variance);

    // Coefficient of variation (lower = more regular = more bot-like)
    const cv = mean > 0 ? stdDev / mean : 0;

    // Check for mechanical regularity (CV < 3% is suspiciously precise)
    if (cv < MAX_REGULARITY_CV && intervals.length >= MIN_HEARTBEATS_FOR_ANALYSIS) {
        anomalies.push(
            `Heartbeat timing too regular (CV=${(cv * 100).toFixed(2)}%, threshold=${MAX_REGULARITY_CV * 100}%)`,
        );
    }

    // Check minimum jitter: each interval must deviate at least ±15% from the expected interval.
    // A legitimate client randomises heartbeats within a ±15-30% window; intervals with less
    // than 15% jitter across the board indicate the client is not applying proper randomisation.
    const minJitterThreshold = EXPECTED_HEARTBEAT_INTERVAL_MS * MIN_JITTER;
    const lowJitterCount = intervals.filter(
        (i) => Math.abs(i - EXPECTED_HEARTBEAT_INTERVAL_MS) < minJitterThreshold,
    ).length;
    if (lowJitterCount > intervals.length * 0.7) {
        anomalies.push(
            `${lowJitterCount}/${intervals.length} intervals have < ${MIN_JITTER * 100}% jitter — client not randomising heartbeats`,
        );
    }

    // Check for intervals way outside expected range
    const minAcceptable = EXPECTED_HEARTBEAT_INTERVAL_MS * (1 - JITTER_TOLERANCE);
    const maxAcceptable = EXPECTED_HEARTBEAT_INTERVAL_MS * (1 + JITTER_TOLERANCE);
    const outOfRange = intervals.filter(
        (i) => i < minAcceptable * 0.5 || i > maxAcceptable * 2,
    );
    if (outOfRange.length > intervals.length * 0.3) {
        anomalies.push(
            `${outOfRange.length}/${intervals.length} intervals outside acceptable range`,
        );
    }

    return {
        isHumanLike: anomalies.length === 0,
        heartbeatCount: timestamps.length,
        meanIntervalMs: Math.round(mean),
        coefficientOfVariation: Math.round(cv * 10000) / 10000,
        anomalies,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab focus tracking
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum tab-blur events before flagging (during a single video session) */
const MAX_TAB_BLURS_BEFORE_FLAG = 5;

export interface TabFocusReport {
    blurCount: number;
    totalBlurDurationMs: number;
    flagged: boolean;
}

/**
 * Evaluate tab focus data sent by the client.
 *
 * @param blurEvents Array of { blurAt, focusAt } timestamps in ms
 */
export function evaluateTabFocus(
    blurEvents: Array<{ blurAt: number; focusAt: number }>,
): TabFocusReport {
    const totalBlurDurationMs = blurEvents.reduce(
        (sum, e) => sum + Math.max(0, e.focusAt - e.blurAt),
        0,
    );

    return {
        blurCount: blurEvents.length,
        totalBlurDurationMs,
        flagged: blurEvents.length > MAX_TAB_BLURS_BEFORE_FLAG,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mouse entropy scoring
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum mouse entropy score for human-like behaviour */
const MIN_MOUSE_ENTROPY = 0.15;

/**
 * Calculate Shannon entropy of mouse movement directions.
 * Bots tend to have zero or very low entropy (no movement, or linear patterns).
 *
 * @param movements Array of {dx, dy} deltas from the client
 */
export function calculateMouseEntropy(
    movements: Array<{ dx: number; dy: number }>,
): { entropy: number; isHumanLike: boolean } {
    if (movements.length < 10) {
        // Not enough data — don't flag
        return { entropy: 1, isHumanLike: true };
    }

    // Quantize directions into 8 octants
    const octantCounts = new Array(8).fill(0);
    for (const m of movements) {
        if (m.dx === 0 && m.dy === 0) continue;
        const angle = Math.atan2(m.dy, m.dx);
        const octant = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 8) % 8;
        octantCounts[octant]++;
    }

    const total = octantCounts.reduce((a, b) => a + b, 0);
    if (total === 0) {
        return { entropy: 0, isHumanLike: false };
    }

    // Shannon entropy (normalized to 0–1 range, where log2(8) = 3 is max)
    let entropy = 0;
    for (const count of octantCounts) {
        if (count > 0) {
            const p = count / total;
            entropy -= p * Math.log2(p);
        }
    }
    const normalizedEntropy = entropy / 3; // log2(8) = 3

    return {
        entropy: Math.round(normalizedEntropy * 1000) / 1000,
        isHumanLike: normalizedEntropy >= MIN_MOUSE_ENTROPY,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite engagement check + flag persistence
// ─────────────────────────────────────────────────────────────────────────────

export interface EngagementReport {
    heartbeat: HeartbeatAnalysis;
    tabFocus: TabFocusReport;
    mouseEntropy: { entropy: number; isHumanLike: boolean };
    flagged: boolean;
}

/**
 * Run all engagement integrity checks and persist any flags.
 */
export async function checkEngagementIntegrity(
    userId: string,
    campaignId: number,
    data: {
        heartbeatTimestamps: number[];
        tabBlurEvents: Array<{ blurAt: number; focusAt: number }>;
        mouseMovements: Array<{ dx: number; dy: number }>;
    },
): Promise<EngagementReport> {
    const heartbeat = analyseHeartbeats(data.heartbeatTimestamps);
    const tabFocus = evaluateTabFocus(data.tabBlurEvents);
    const mouseEntropy = calculateMouseEntropy(data.mouseMovements);

    const flagged =
        !heartbeat.isHumanLike || tabFocus.flagged || !mouseEntropy.isHumanLike;

    // Persist individual flags
    const flagsToCreate: Array<{
        userId: string;
        campaignId: number;
        flagType: string;
        details: Prisma.InputJsonValue;
    }> = [];

    if (!heartbeat.isHumanLike) {
        flagsToCreate.push({
            userId,
            campaignId,
            flagType: 'HEARTBEAT_ANOMALY',
            details: {
                meanIntervalMs: heartbeat.meanIntervalMs,
                cv: heartbeat.coefficientOfVariation,
                anomalies: heartbeat.anomalies,
            },
        });
    }

    if (tabFocus.flagged) {
        flagsToCreate.push({
            userId,
            campaignId,
            flagType: 'TAB_FOCUS_LOSS',
            details: {
                blurCount: tabFocus.blurCount,
                totalBlurDurationMs: tabFocus.totalBlurDurationMs,
            },
        });
    }

    if (!mouseEntropy.isHumanLike) {
        flagsToCreate.push({
            userId,
            campaignId,
            flagType: 'LOW_MOUSE_ENTROPY',
            details: {
                entropy: mouseEntropy.entropy,
                threshold: MIN_MOUSE_ENTROPY,
            },
        });
    }

    if (flagsToCreate.length > 0) {
        await prisma.engagementFlag.createMany({ data: flagsToCreate });
    }

    return { heartbeat, tabFocus, mouseEntropy, flagged };
}
