'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGeminiLive, type SessionPhase } from '@/hooks/useGeminiLive';

// ─────────────────────────────────────────────────────────────────────────────
// InterviewClient — Chartered Credential Interview Page
//
// Route: /academy/interview
//
// Eligibility: 3+ passed campaign assessments (score >= 60)
// Duration: 10 minutes
// Scoring: 80+ to pass (stricter than campaign assessment)
//
// Flow:
//   1. Check eligibility (3+ passed assessments)
//   2. Show interview briefing + instructions
//   3. Wallet signature → Gemini connection → 10-minute voice session
//   4. Agent evaluates cross-protocol knowledge
//   5. Score display + badge eligibility notification
// ─────────────────────────────────────────────────────────────────────────────

type PagePhase =
  | 'loading'
  | 'not-eligible'
  | 'already-completed'
  | 'instructions'
  | 'requesting'
  | 'connecting'
  | 'active'
  | 'completing'
  | 'done'
  | 'error';

interface CompletedSession {
  overallScore: number | null;
  depthScore: number | null;
  accuracyScore: number | null;
  originalityScore: number | null;
  completedAt: string;
}

const INTERVIEW_DURATION = 600; // 10 minutes

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export default function InterviewClient() {
  const [pagePhase, setPagePhase] = useState<PagePhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [passedCount, setPassedCount] = useState(0);
  const [completedSession, setCompletedSession] = useState<CompletedSession | null>(null);
  const [micTested, setMicTested] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const scoresRef = useRef<{
    depthScore?: number;
    accuracyScore?: number;
    originalityScore?: number;
    overallScore?: number;
    notes?: string;
  }>({});
  const completedRef = useRef(false);
  const configRef = useRef<{
    token: string;
    model: string;
    systemInstruction: string;
    voiceName: string;
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    maxDurationSeconds: number;
  } | null>(null);

  // Tool call handler
  const handleToolCall = useCallback(async (call: { id: string; name: string; args: Record<string, unknown> }) => {
    if (call.name === 'submit_scores') {
      scoresRef.current = {
        depthScore: Number(call.args.depthScore) || undefined,
        accuracyScore: Number(call.args.accuracyScore) || undefined,
        originalityScore: Number(call.args.originalityScore) || undefined,
        overallScore: Number(call.args.overallScore) || undefined,
        notes: call.args.notes ? String(call.args.notes) : undefined,
      };
      return { acknowledged: true, message: 'Scores recorded. Please wrap up the conversation.' };
    }
    if (call.name === 'end_session') {
      return { acknowledged: true };
    }
    return { error: 'Unknown tool' };
  }, []);

  // Session end handler
  const handleSessionEnd = useCallback(async (reason: string) => {
    if (completedRef.current) return;
    completedRef.current = true;

    setPagePhase('completing');

    try {
      const res = await fetch('/api/agent/session/complete', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          sessionId,
          durationSeconds: gemini.durationSeconds,
          depthScore: scoresRef.current.depthScore,
          accuracyScore: scoresRef.current.accuracyScore,
          originalityScore: scoresRef.current.originalityScore,
          overallScore: scoresRef.current.overallScore,
          scoringNotes: scoresRef.current.notes
            ? { agentNotes: scoresRef.current.notes }
            : undefined,
          transcript: gemini.transcript.map((t) => ({
            role: t.role,
            text: t.text,
            timestamp: t.timestamp,
          })),
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setCompletedSession({
          overallScore: result.overallScore ?? scoresRef.current.overallScore ?? null,
          depthScore: scoresRef.current.depthScore ?? null,
          accuracyScore: scoresRef.current.accuracyScore ?? null,
          originalityScore: scoresRef.current.originalityScore ?? null,
          completedAt: new Date().toISOString(),
        });
        setPagePhase('done');
      } else {
        throw new Error('Failed to save session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save session');
      setPagePhase('error');
    }
  }, [sessionId]);

  const gemini = useGeminiLive({
    onToolCall: handleToolCall,
    onSessionEnd: handleSessionEnd,
    onError: (err) => {
      setError(err);
      setPagePhase('error');
    },
  });

  // Check eligibility + existing session on mount
  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/agent/session', { headers: authHeaders() });
        if (!res.ok) {
          setPagePhase('not-eligible');
          return;
        }
        const data = await res.json();
        const sessions = data.sessions ?? [];

        // Check for existing completed interview
        const existingInterview = sessions.find(
          (s: { sessionType: string; status: string }) =>
            s.sessionType === 'CHARTERED_INTERVIEW' && s.status === 'COMPLETED',
        );

        if (existingInterview && !cancelled) {
          setCompletedSession({
            overallScore: existingInterview.overallScore,
            depthScore: existingInterview.depthScore,
            accuracyScore: existingInterview.accuracyScore,
            originalityScore: existingInterview.originalityScore,
            completedAt: existingInterview.completedAt,
          });
          setPagePhase('already-completed');
          return;
        }

        // Count passed campaign assessments (eligibility: 3+ with score >= 60)
        const passed = sessions.filter(
          (s: { sessionType: string; status: string; overallScore: number | null }) =>
            s.sessionType === 'CAMPAIGN_ASSESSMENT' &&
            s.status === 'COMPLETED' &&
            (s.overallScore ?? 0) >= 60,
        );

        if (!cancelled) {
          setPassedCount(passed.length);
          if (passed.length >= 3) {
            setPagePhase('instructions');
          } else {
            setPagePhase('not-eligible');
          }
        }
      } catch {
        if (!cancelled) setPagePhase('not-eligible');
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  // Auto-end when max duration reached
  useEffect(() => {
    const max = configRef.current?.maxDurationSeconds ?? INTERVIEW_DURATION;
    if (max > 0 && gemini.durationSeconds >= max && gemini.phase === 'active') {
      gemini.disconnect('Maximum duration reached');
    }
  }, [gemini.durationSeconds, gemini.phase]);

  // Sync gemini phase
  useEffect(() => {
    if (gemini.phase === 'active') setPagePhase('active');
  }, [gemini.phase]);

  const testMic = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicTested(true);
    } catch {
      setMicError('Could not access microphone. Please check permissions.');
    }
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    setPagePhase('requesting');

    let sid: string;
    let sessionToken: string;

    // Request session
    try {
      const res = await fetch('/api/agent/session', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionType: 'CHARTERED_INTERVIEW' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to request interview session');
      }
      const data = await res.json();
      sid = data.sessionId;
      sessionToken = data.sessionToken;
      setSessionId(sid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request session');
      setPagePhase('error');
      return;
    }

    // Start session
    try {
      const res = await fetch('/api/agent/session/start', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionToken, walletSignature: 'interview-auto-' + Date.now() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to start session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
      setPagePhase('error');
      return;
    }

    // Get token + config
    setPagePhase('connecting');
    try {
      const res = await fetch('/api/agent/session/token', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionId: sid }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to get session config');
      }
      const config = await res.json();
      configRef.current = config;
      gemini.connect(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setPagePhase('error');
    }
  }, [gemini]);

  const handleEnd = () => {
    gemini.disconnect('User ended session');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const maxDur = configRef.current?.maxDurationSeconds ?? INTERVIEW_DURATION;
  const remaining = Math.max(0, maxDur - gemini.durationSeconds);

  // Timer colors for the interview
  function timerColor(): string {
    if (remaining <= 30) return 'text-red-500';
    if (remaining <= 60) return 'text-amber-400';
    return 'text-green-400';
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="border-b border-white/[.06] bg-[#030303]">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/academy"
            className="text-[11px] font-mono text-neutral-500 hover:text-white transition-colors shrink-0"
          >
            &larr; Academy
          </Link>
          <div className="min-w-0">
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-amber-500/70">
              Chartered Credential
            </div>
            <div className="text-sm font-display font-bold text-white">
              Interview Session
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* ── Loading ─────────────────────────────────────────── */}
        {pagePhase === 'loading' && (
          <div className="text-center py-20">
            <div className="w-10 h-10 mx-auto rounded-full border-2 border-white/10 border-t-amber-400 animate-spin" />
            <div className="mt-4 text-[11px] font-mono text-neutral-500">Checking eligibility...</div>
          </div>
        )}

        {/* ── Not Eligible ────────────────────────────────────── */}
        {pagePhase === 'not-eligible' && (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-neutral-900 border border-white/[.06] flex items-center justify-center">
              <svg className="w-10 h-10 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="font-display font-bold text-2xl text-white mb-2">Not Yet Eligible</h2>
            <p className="text-[13px] text-neutral-400 max-w-sm mx-auto mb-3">
              The Chartered Interview requires <strong className="text-white">3 or more passed campaign assessments</strong> with a score of 60+.
            </p>
            <div className="inline-flex items-center gap-2 bg-white/[.03] border border-white/[.06] rounded-xl px-4 py-2 mb-8">
              <span className="text-[12px] text-neutral-500">Your progress:</span>
              <span className="text-[14px] font-mono font-bold text-white">{passedCount} / 3</span>
              <span className="text-[11px] text-neutral-600">passed</span>
            </div>
            <div>
              <Link
                href="/academy"
                className="text-[12px] font-mono text-amber-400 hover:text-amber-300 transition-colors"
              >
                Browse campaigns to earn assessments &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* ── Already Completed ───────────────────────────────── */}
        {(pagePhase === 'already-completed' || pagePhase === 'done') && completedSession && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <div className={`w-20 h-20 mx-auto mb-5 rounded-full border-2 flex items-center justify-center ${
                (completedSession.overallScore ?? 0) >= 80
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-white/[.03] border-white/[.06]'
              }`}>
                {(completedSession.overallScore ?? 0) >= 80 ? (
                  <span className="text-3xl">&#9733;</span>
                ) : (
                  <svg className="w-10 h-10 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-amber-400/80 mb-1">
                Interview {pagePhase === 'done' ? 'Complete' : 'Previously Completed'}
              </div>
              <h2 className="font-display font-bold text-2xl text-white">
                {(completedSession.overallScore ?? 0) >= 80 ? 'Chartered Status Achieved' : 'Interview Complete'}
              </h2>
            </div>

            {/* Score Card */}
            <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-6 mb-4">
              <div className="text-center mb-6">
                <div className={`text-6xl font-display font-black ${
                  (completedSession.overallScore ?? 0) >= 80 ? 'text-amber-400' : (completedSession.overallScore ?? 0) >= 60 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {completedSession.overallScore ?? '\u2014'}
                </div>
                <div className={`text-[12px] font-bold mt-1 ${
                  (completedSession.overallScore ?? 0) >= 80 ? 'text-amber-400' : (completedSession.overallScore ?? 0) >= 60 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {(completedSession.overallScore ?? 0) >= 80 ? 'CHARTERED' : (completedSession.overallScore ?? 0) >= 60 ? 'PASSED' : 'BELOW THRESHOLD'}
                </div>
                <div className="text-[10px] text-neutral-600 mt-1">80+ required for Chartered credential</div>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/[.06]">
                {[
                  { label: 'Depth', value: completedSession.depthScore },
                  { label: 'Accuracy', value: completedSession.accuracyScore },
                  { label: 'Originality', value: completedSession.originalityScore },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="text-2xl font-display font-bold text-white">{s.value ?? '\u2014'}</div>
                    <div className="text-[9px] font-mono text-neutral-600 uppercase">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {(completedSession.overallScore ?? 0) >= 80 && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 mb-6 text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400/70 mb-1">Badge Unlocked</div>
                <div className="text-lg font-display font-bold text-amber-400">Chartered Credential</div>
                <div className="text-[11px] text-neutral-500 mt-1">Top 0.5% globally &middot; Cross-protocol verified</div>
              </div>
            )}

            {/* Transcript */}
            {gemini.transcript.length > 0 && (
              <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-4 mb-6 max-h-48 overflow-y-auto">
                <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 mb-2">Transcript</div>
                {gemini.transcript.map((entry, i) => (
                  <div key={i} className={`text-[11px] leading-relaxed mb-1.5 ${entry.role === 'user' ? 'text-neutral-300' : 'text-amber-400/70'}`}>
                    <span className="text-[9px] font-mono text-neutral-600 mr-1.5 uppercase">
                      {entry.role === 'user' ? 'You' : 'AI'}
                    </span>
                    {entry.text}
                  </div>
                ))}
              </div>
            )}

            <Link
              href="/academy"
              className="block w-full text-center py-3 rounded-xl border border-white/[.08] text-[12px] font-mono text-neutral-400 hover:text-white hover:border-white/20 transition-all"
            >
              Back to Academy
            </Link>
          </div>
        )}

        {/* ── Instructions ────────────────────────────────────── */}
        {pagePhase === 'instructions' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hero */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center rotate-3">
                <span className="text-3xl -rotate-3">&#9733;</span>
              </div>
              <h2 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Chartered Interview</h2>
              <p className="text-[13px] text-neutral-400 max-w-md mx-auto">
                A 10-minute voice interview testing cross-protocol knowledge, critical thinking, and original insight.
              </p>
            </div>

            {/* Eligibility badge */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 bg-green-500/5 border border-green-500/20 rounded-full px-4 py-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-[11px] font-mono text-green-400">Eligible &middot; {passedCount} assessments passed</span>
              </div>
            </div>

            {/* What to expect */}
            <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-5 md:p-6 mb-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 mb-4">What to Expect</div>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-amber-400">1</span>
                  </div>
                  <div>
                    <div className="text-[13px] text-white font-medium">Cross-Protocol Questions</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">Questions spanning multiple ecosystems and protocols you've studied.</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-amber-400">2</span>
                  </div>
                  <div>
                    <div className="text-[13px] text-white font-medium">Hypothetical Scenarios</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">&ldquo;Walk me through the risks of...&rdquo; style questions testing first-principles reasoning.</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-amber-400">3</span>
                  </div>
                  <div>
                    <div className="text-[13px] text-white font-medium">10-Minute Session</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">Conversational format. Score of <strong className="text-white">80+</strong> earns the Chartered credential.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Rules */}
            <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-5 mb-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 mb-3">Before You Begin</div>
              <div className="space-y-2 text-[12px] text-neutral-400">
                <div className="flex gap-2">
                  <span className="text-amber-400 shrink-0">&bull;</span>
                  <span>This is a <strong className="text-white">one-time</strong> session. You cannot retake it.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-amber-400 shrink-0">&bull;</span>
                  <span>Ensure you are in a <strong className="text-white">quiet environment</strong> with a working microphone.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-amber-400 shrink-0">&bull;</span>
                  <span>The AI will ask progressively deeper questions. Take your time to think before answering.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-amber-400 shrink-0">&bull;</span>
                  <span>Scoring: Depth, Accuracy, and Originality. <strong className="text-white">80+ overall to pass.</strong></span>
                </div>
              </div>
            </div>

            {/* Mic Test */}
            <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600">Microphone</div>
                  <div className="text-[12px] text-neutral-400 mt-0.5">
                    {micTested ? 'Ready to go' : 'Required before starting'}
                  </div>
                </div>
                <button
                  onClick={testMic}
                  className={`text-[12px] font-mono px-4 py-2.5 rounded-xl border transition-all min-w-[100px] ${
                    micTested
                      ? 'border-green-500/30 bg-green-500/10 text-green-400'
                      : 'border-white/10 text-neutral-300 hover:border-white/20 hover:text-white active:scale-95'
                  }`}
                >
                  {micTested ? 'Mic OK' : 'Test Mic'}
                </button>
              </div>
              {micError && (
                <div className="mt-2 text-[11px] text-red-400">{micError}</div>
              )}
            </div>

            {/* Start */}
            <button
              onClick={handleStart}
              disabled={!micTested}
              className="w-full py-4 rounded-2xl bg-amber-500 text-black text-[14px] font-display font-bold transition-all hover:bg-amber-400 hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              Begin Interview
            </button>

            {!micTested && (
              <div className="text-center text-[10px] text-neutral-600 mt-3">Test your microphone to unlock</div>
            )}
          </div>
        )}

        {/* ── Requesting / Connecting ─────────────────────────── */}
        {(pagePhase === 'requesting' || pagePhase === 'connecting') && (
          <div className="text-center py-20 animate-in fade-in duration-300">
            <div className="w-14 h-14 mx-auto rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
            <div className="mt-5 text-[12px] font-mono text-amber-400">
              {pagePhase === 'requesting' ? 'Securing your session...' : 'Connecting to interviewer...'}
            </div>
          </div>
        )}

        {/* ── Active Session ──────────────────────────────────── */}
        {pagePhase === 'active' && (
          <div className="animate-in fade-in duration-300">
            {/* Status bar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Live Interview</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-neutral-500">
                  {formatTime(gemini.durationSeconds)}
                </span>
                <span className="text-[10px] text-neutral-700">/</span>
                <span className={`text-[13px] font-mono font-bold tabular-nums ${timerColor()}`}>
                  {formatTime(remaining)}
                </span>
              </div>
            </div>

            {/* Timer bar */}
            <div className="h-1 w-full rounded-full bg-white/[.06] overflow-hidden mb-8">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                  remaining <= 30 ? 'bg-red-500' : remaining <= 60 ? 'bg-amber-400' : 'bg-green-400'
                }`}
                style={{ width: `${Math.max(0, (remaining / maxDur) * 100)}%` }}
              />
            </div>

            {/* Voice Visualizer */}
            <div className="flex items-end justify-center gap-1 h-24 mb-6">
              {Array.from({ length: 16 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    gemini.isModelSpeaking
                      ? 'bg-amber-400'
                      : gemini.isMuted
                        ? 'bg-red-400/40'
                        : 'bg-white/15'
                  }`}
                  style={{
                    height: gemini.isModelSpeaking
                      ? `${15 + Math.random() * 85}%`
                      : gemini.isMuted
                        ? '8%'
                        : `${5 + Math.random() * 25}%`,
                  }}
                />
              ))}
            </div>

            <div className="text-center text-[12px] text-neutral-500 mb-6">
              {gemini.isModelSpeaking ? 'Interviewer speaking...' : gemini.isMuted ? 'Microphone muted' : 'Listening...'}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <button
                onClick={gemini.toggleMute}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-[16px] border transition-all active:scale-90 ${
                  gemini.isMuted
                    ? 'bg-red-500/20 border-red-500/40 text-red-400'
                    : 'bg-white/[.03] border-white/[.08] text-white hover:bg-white/[.06]'
                }`}
                title={gemini.isMuted ? 'Unmute' : 'Mute'}
              >
                {gemini.isMuted ? '\uD83D\uDD07' : '\uD83C\uDF99'}
              </button>

              <button
                onClick={handleEnd}
                className="px-6 py-3 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 text-[12px] font-display font-bold hover:bg-red-500/25 transition-all active:scale-95"
              >
                End Interview
              </button>
            </div>

            {/* Live transcript */}
            {gemini.transcript.length > 0 && (
              <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-4 max-h-56 overflow-y-auto">
                <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 mb-2">Live Transcript</div>
                {gemini.transcript.map((entry, i) => (
                  <div key={i} className={`text-[11px] leading-relaxed mb-1.5 ${entry.role === 'user' ? 'text-neutral-300' : 'text-amber-400/70'}`}>
                    <span className="text-[9px] font-mono text-neutral-600 mr-1.5 uppercase">
                      {entry.role === 'user' ? 'You' : 'AI'}
                    </span>
                    {entry.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Completing ──────────────────────────────────────── */}
        {pagePhase === 'completing' && (
          <div className="text-center py-20">
            <div className="w-12 h-12 mx-auto rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
            <div className="mt-5 text-[12px] font-mono text-amber-400 animate-pulse">Saving interview results...</div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────── */}
        {pagePhase === 'error' && (
          <div className="text-center py-16">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="text-[12px] font-mono text-red-400 mb-5">{error ?? 'Something went wrong'}</div>
            <Link
              href="/academy"
              className="text-[12px] font-mono text-neutral-400 px-5 py-2.5 rounded-xl border border-white/10 hover:text-white transition-all"
            >
              Back to Academy
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
