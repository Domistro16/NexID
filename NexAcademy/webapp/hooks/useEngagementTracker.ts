'use client';

import { useCallback, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Engagement Tracker Hook
//
// Collects behavioral telemetry during video/quiz sessions:
// - Heartbeat timestamps (3-5s random jitter intervals)
// - Tab focus/blur events
// - Mouse movement coordinates (throttled)
//
// Periodically flushes data to the engagement API endpoint.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum heartbeat interval (ms) */
const MIN_HEARTBEAT_MS = 3000;
/** Maximum heartbeat interval (ms) */
const MAX_HEARTBEAT_MS = 5000;
/** Mouse movement throttle interval (ms) */
const MOUSE_THROTTLE_MS = 500;
/** How often to flush collected data to the server (ms) */
const FLUSH_INTERVAL_MS = 15000;
/** Max no-mouse-movement before flagging (ms) */
const NO_MOVEMENT_THRESHOLD_MS = 60000;

interface EngagementData {
    heartbeats: number[];
    tabBlurEvents: Array<{ blurAt: number; focusAt: number | null }>;
    mouseMovements: Array<{ x: number; y: number; t: number }>;
}

interface UseEngagementTrackerOptions {
    campaignId: number;
    enabled: boolean;
    /** Callback when tab loses focus (e.g., pause video) */
    onTabBlur?: () => void;
    /** Callback when tab regains focus */
    onTabFocus?: () => void;
    /** Callback when no mouse movement detected for 60s */
    onInactivity?: () => void;
}

export function useEngagementTracker(options: UseEngagementTrackerOptions) {
    const { campaignId, enabled, onTabBlur, onTabFocus, onInactivity } = options;
    const dataRef = useRef<EngagementData>({
        heartbeats: [],
        tabBlurEvents: [],
        mouseMovements: [],
    });
    const activeBlurRef = useRef<{ blurAt: number } | null>(null);
    const lastMouseMoveRef = useRef(Date.now());
    const lastMouseEventRef = useRef(0);
    const inactivityFiredRef = useRef(false);

    // ── Heartbeat ───────────────────────────────────────────────────────────

    useEffect(() => {
        if (!enabled) return;

        const sendHeartbeat = () => {
            // Only send heartbeats when the tab is visible
            if (document.visibilityState === 'visible') {
                dataRef.current.heartbeats.push(Date.now());
            }
        };

        // Random jitter interval
        let timeoutId: ReturnType<typeof setTimeout>;
        const scheduleNext = () => {
            const jitter = MIN_HEARTBEAT_MS + Math.random() * (MAX_HEARTBEAT_MS - MIN_HEARTBEAT_MS);
            timeoutId = setTimeout(() => {
                sendHeartbeat();
                scheduleNext();
            }, jitter);
        };

        sendHeartbeat(); // Initial heartbeat
        scheduleNext();

        return () => clearTimeout(timeoutId);
    }, [enabled]);

    // ── Tab Focus/Blur ──────────────────────────────────────────────────────

    useEffect(() => {
        if (!enabled) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                activeBlurRef.current = { blurAt: Date.now() };
                onTabBlur?.();
            } else {
                if (activeBlurRef.current) {
                    dataRef.current.tabBlurEvents.push({
                        blurAt: activeBlurRef.current.blurAt,
                        focusAt: Date.now(),
                    });
                    activeBlurRef.current = null;
                }
                onTabFocus?.();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [enabled, onTabBlur, onTabFocus]);

    // ── Mouse Movement ──────────────────────────────────────────────────────

    useEffect(() => {
        if (!enabled) return;

        const handleMouseMove = (e: MouseEvent) => {
            const now = Date.now();
            // Throttle
            if (now - lastMouseEventRef.current < MOUSE_THROTTLE_MS) return;
            lastMouseEventRef.current = now;
            lastMouseMoveRef.current = now;
            inactivityFiredRef.current = false;

            dataRef.current.mouseMovements.push({
                x: e.clientX,
                y: e.clientY,
                t: now,
            });

            // Keep only last 200 points to avoid memory bloat
            if (dataRef.current.mouseMovements.length > 200) {
                dataRef.current.mouseMovements = dataRef.current.mouseMovements.slice(-200);
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        return () => document.removeEventListener('mousemove', handleMouseMove);
    }, [enabled]);

    // ── Inactivity Detection ────────────────────────────────────────────────

    useEffect(() => {
        if (!enabled) return;

        const checkInterval = setInterval(() => {
            const elapsed = Date.now() - lastMouseMoveRef.current;
            if (elapsed >= NO_MOVEMENT_THRESHOLD_MS && !inactivityFiredRef.current) {
                inactivityFiredRef.current = true;
                onInactivity?.();
            }
        }, 5000);

        return () => clearInterval(checkInterval);
    }, [enabled, onInactivity]);

    // ── Periodic Flush ──────────────────────────────────────────────────────

    useEffect(() => {
        if (!enabled) return;

        const flushInterval = setInterval(() => {
            flushData();
        }, FLUSH_INTERVAL_MS);

        return () => {
            clearInterval(flushInterval);
            // Final flush on unmount
            flushData();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, campaignId]);

    const flushData = useCallback(async () => {
        const data = dataRef.current;
        if (
            data.heartbeats.length === 0 &&
            data.tabBlurEvents.length === 0 &&
            data.mouseMovements.length === 0
        ) {
            return;
        }

        // Clone and reset
        const payload = {
            heartbeats: [...data.heartbeats],
            tabBlurEvents: [...data.tabBlurEvents],
            mouseMovements: [...data.mouseMovements],
        };
        data.heartbeats = [];
        data.tabBlurEvents = [];
        data.mouseMovements = [];

        try {
            await fetch(`/api/campaigns/${campaignId}/engagement`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch {
            // Re-add data if flush fails
            data.heartbeats.push(...payload.heartbeats);
            data.tabBlurEvents.push(...payload.tabBlurEvents);
            data.mouseMovements.push(...payload.mouseMovements);
        }
    }, [campaignId]);

    return { flushData };
}
