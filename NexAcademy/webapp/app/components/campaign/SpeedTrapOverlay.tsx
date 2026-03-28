'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// SpeedTrapOverlay — Between-video speed trap gate (within module groups)
//
// Speed traps fire BETWEEN videos within a module group. When the user clicks
// "Mark Complete" on a video, the parent calls `checkTrap(groupIndex, videoIndex)`
// via ref. If a trap is queued for that transition, the overlay appears.
// ─────────────────────────────────────────────────────────────────────────────

interface SpeedTrap {
  id: string;
  questionId: string;
  questionText: string;
  options: string[] | null;
  triggerAfterGroup: number;
  triggerAfterVideoInGroup: number;
  windowSeconds: number;
}

export interface SpeedTrapRef {
  /** Check if a speed trap fires after a given video within a group. */
  checkTrap(groupIndex: number, videoIndex: number): Promise<{ fired: boolean; correct: boolean }>;
  /** Fire all queued traps for a group sequentially. Returns aggregate result. */
  checkTrapsForGroup(groupIndex: number): Promise<{ firedCount: number; correctCount: number }>;
}

interface Props {
  campaignId: number;
  /** Array of video counts per group, e.g. [3, 2, 4] */
  groupStructure: number[];
  onTrapResult?: (result: { questionId: string; correct: boolean; timedOut: boolean }) => void;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

const SpeedTrapOverlay = forwardRef<SpeedTrapRef, Props>(function SpeedTrapOverlay(
  { campaignId, groupStructure, onTrapResult },
  ref,
) {
  const [traps, setTraps] = useState<SpeedTrap[]>([]);
  const [activeTrap, setActiveTrap] = useState<SpeedTrap | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ correct: boolean; timedOut: boolean } | null>(null);

  const firedTrapsRef = useRef(new Set<string>());
  const trapOpenTimeRef = useRef(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolverRef = useRef<((value: { fired: boolean; correct: boolean }) => void) | null>(null);

  // Fetch traps on mount
  useEffect(() => {
    // Need at least one group with 2+ videos for traps
    const hasEligible = groupStructure.some((vc) => vc >= 2);
    if (!hasEligible) return;

    async function loadTraps() {
      try {
        const groupsParam = encodeURIComponent(JSON.stringify(groupStructure));
        const res = await fetch(
          `/api/campaigns/${campaignId}/speed-trap?groups=${groupsParam}`,
          { headers: authHeaders() },
        );
        if (res.ok) {
          const data = await res.json();
          setTraps(data.traps ?? []);
        }
      } catch {
        // Traps are optional — fail silently
      }
    }

    loadTraps();
  }, [campaignId, groupStructure]);

  const handleSubmit = useCallback(
    async (trap: SpeedTrap, index: number | null, timedOut = false) => {
      if (submitting) return;
      setSubmitting(true);

      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      const responseTime = (Date.now() - trapOpenTimeRef.current) / 1000;

      let correct = false;
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/speed-trap`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            questionId: trap.questionId,
            selectedIndex: index ?? -1,
            triggerAfterGroup: trap.triggerAfterGroup,
            triggerAfterVideoInGroup: trap.triggerAfterVideoInGroup,
            responseTimeSeconds: responseTime,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          correct = data.correct;
          setResult({ correct: data.correct, timedOut: data.timedOut });
          onTrapResult?.({
            questionId: trap.questionId,
            correct: data.correct,
            timedOut: data.timedOut,
          });
        } else {
          setResult({ correct: false, timedOut });
        }
      } catch {
        setResult({ correct: false, timedOut });
      } finally {
        setSubmitting(false);
        // Auto-dismiss after 2 seconds, resolve the promise
        setTimeout(() => {
          setActiveTrap(null);
          setResult(null);
          resolverRef.current?.({ fired: true, correct });
          resolverRef.current = null;
        }, 2000);
      }
    },
    [campaignId, submitting, onTrapResult],
  );

  const handleAnswer = (index: number) => {
    if (result || submitting) return;
    setSelectedIndex(index);
    handleSubmit(activeTrap!, index);
  };

  // Fire a single trap — returns a promise that resolves on answer/timeout
  const fireTrap = useCallback((trap: SpeedTrap): Promise<{ fired: boolean; correct: boolean }> => {
    firedTrapsRef.current.add(trap.id);
    setActiveTrap(trap);
    setCountdown(trap.windowSeconds);
    setSelectedIndex(null);
    setResult(null);
    trapOpenTimeRef.current = Date.now();

    // Start countdown
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          handleSubmit(trap, null, true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, [handleSubmit]);

  // Imperative API for parent to call
  useImperativeHandle(ref, () => ({
    checkTrap(groupIndex: number, videoIndex: number): Promise<{ fired: boolean; correct: boolean }> {
      const trap = traps.find(
        (t) =>
          t.triggerAfterGroup === groupIndex &&
          t.triggerAfterVideoInGroup === videoIndex &&
          !firedTrapsRef.current.has(t.id),
      );

      if (!trap) {
        return Promise.resolve({ fired: false, correct: true });
      }

      return fireTrap(trap);
    },

    async checkTrapsForGroup(groupIndex: number): Promise<{ firedCount: number; correctCount: number }> {
      // Find all unfired traps for this group, sorted by video index
      const groupTraps = traps
        .filter((t) => t.triggerAfterGroup === groupIndex && !firedTrapsRef.current.has(t.id))
        .sort((a, b) => a.triggerAfterVideoInGroup - b.triggerAfterVideoInGroup);

      let firedCount = 0;
      let correctCount = 0;

      // Fire traps sequentially
      for (const trap of groupTraps) {
        const result = await fireTrap(trap);
        if (result.fired) firedCount++;
        if (result.correct) correctCount++;
      }

      return { firedCount, correctCount };
    },
  }), [traps, fireTrap]);

  // Nothing to show if no active trap
  if (!activeTrap) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md mx-4">
        {/* Timer bar */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-nexid-gold">Speed Trap</span>
            {!result && (
              <span className="text-[10px] font-mono text-red-400 animate-pulse">LIVE</span>
            )}
          </div>
          {!result && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-nexid-gold transition-all duration-1000 ease-linear"
                  style={{
                    width: `${Math.max(0, (countdown / activeTrap.windowSeconds) * 100)}%`,
                  }}
                />
              </div>
              <span className={`text-sm font-mono font-bold ${countdown <= 3 ? 'text-red-400' : 'text-white'}`}>
                {countdown}s
              </span>
            </div>
          )}
        </div>

        {/* Question card */}
        <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-5">
          <p className="text-sm text-white leading-relaxed mb-4">{activeTrap.questionText}</p>

          {/* Show result */}
          {result ? (
            <div className={`text-center py-3 rounded-lg text-sm font-bold ${
              result.timedOut
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : result.correct
                  ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                  : 'bg-red-500/15 text-red-400 border border-red-500/30'
            }`}>
              {result.timedOut ? 'Time\'s up!' : result.correct ? 'Correct!' : 'Incorrect'}
            </div>
          ) : activeTrap.options && activeTrap.options.length > 0 ? (
            <div className="space-y-2">
              {activeTrap.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  disabled={submitting || selectedIndex !== null}
                  className={`w-full text-left rounded-lg border px-4 py-3 text-[13px] transition-colors ${
                    selectedIndex === idx
                      ? 'border-nexid-gold/60 bg-nexid-gold/15 text-nexid-gold'
                      : 'border-white/10 bg-black/40 text-white/80 hover:border-white/30 hover:text-white'
                  } disabled:opacity-60`}
                >
                  <span className="font-mono text-[10px] mr-2 text-neutral-500">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-neutral-500">No options available</div>
          )}
        </div>
      </div>
    </div>
  );
});

export default SpeedTrapOverlay;
