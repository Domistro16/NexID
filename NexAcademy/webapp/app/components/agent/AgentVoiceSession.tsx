'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGeminiLive, type SessionPhase } from '@/hooks/useGeminiLive';

// ─────────────────────────────────────────────────────────────────────────────
// AgentVoiceSession — Full voice session UI component
//
// Usage:
//   <AgentVoiceSession sessionId="..." onComplete={handleComplete} />
//
// Flow:
//   1. Component mounts → fetches ephemeral token + config from /api/agent/session/token
//   2. Opens Gemini Live WebSocket with mic + speaker
//   3. Displays live transcript, timer, status indicators
//   4. On end → calls /api/agent/session/complete with transcript + scores
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  sessionId: string;
  maxDurationSeconds?: number;
  onComplete?: (result: { overallScore: number | null }) => void;
  onError?: (error: string) => void;
}

export default function AgentVoiceSession({
  sessionId,
  maxDurationSeconds,
  onComplete,
  onError,
}: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'active' | 'completing' | 'done' | 'error'>('loading');
  const [statusMessage, setStatusMessage] = useState('Preparing session...');
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
      // The model wants to end — we'll handle this in onSessionEnd
      return { acknowledged: true };
    }

    return { error: 'Unknown tool' };
  }, []);

  const handleSessionEnd = useCallback(async (reason: string) => {
    if (completedRef.current) return;
    completedRef.current = true;

    setStatus('completing');
    setStatusMessage('Saving session results...');

    try {
      const token = localStorage.getItem('auth_token') ?? '';
      const res = await fetch('/api/agent/session/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
        setStatus('done');
        setStatusMessage('Session complete');
        onComplete?.({ overallScore: result.overallScore });
      } else {
        throw new Error('Failed to save session');
      }
    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : 'Failed to save session';
      setStatusMessage(msg);
      onError?.(msg);
    }
  }, [sessionId, onComplete, onError]);

  const gemini = useGeminiLive({
    onToolCall: handleToolCall,
    onSessionEnd: handleSessionEnd,
    onError: (err) => {
      setStatus('error');
      setStatusMessage(err);
      onError?.(err);
    },
  });

  // Fetch config and auto-connect
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const token = localStorage.getItem('auth_token') ?? '';
        const res = await fetch('/api/agent/session/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? 'Failed to get session config');
        }

        const config = await res.json();
        if (cancelled) return;

        configRef.current = config;
        setStatus('ready');
        setStatusMessage('Ready — click Start to begin');
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to initialize';
        setStatus('error');
        setStatusMessage(msg);
        onError?.(msg);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [sessionId, onError]);

  // Auto-end when max duration reached
  useEffect(() => {
    const max = maxDurationSeconds ?? configRef.current?.maxDurationSeconds ?? 0;
    if (max > 0 && gemini.durationSeconds >= max && gemini.phase === 'active') {
      gemini.disconnect('Maximum duration reached');
    }
  }, [gemini.durationSeconds, gemini.phase, maxDurationSeconds]);

  // Sync phase to status
  useEffect(() => {
    if (gemini.phase === 'active') setStatus('active');
  }, [gemini.phase]);

  const handleStart = () => {
    if (!configRef.current) return;
    setStatusMessage('Connecting...');
    gemini.connect(configRef.current);
  };

  const handleEnd = () => {
    gemini.disconnect('User ended session');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const maxDur = maxDurationSeconds ?? configRef.current?.maxDurationSeconds ?? 0;

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto">
      {/* Status Bar */}
      <div className="w-full bg-[#060606] border border-white/[.06] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                status === 'active'
                  ? 'bg-green-400 animate-pulse'
                  : status === 'error'
                    ? 'bg-red-400'
                    : status === 'done'
                      ? 'bg-blue-400'
                      : 'bg-neutral-500'
              }`}
            />
            <span className="text-[10px] font-mono uppercase text-neutral-400">
              {status === 'active' ? 'Live' : status}
            </span>
          </div>

          {status === 'active' && (
            <div className="text-[11px] font-mono text-white">
              {formatTime(gemini.durationSeconds)}
              {maxDur > 0 && (
                <span className="text-neutral-500"> / {formatTime(maxDur)}</span>
              )}
            </div>
          )}
        </div>

        {/* Voice Visualizer */}
        <div className="flex items-center justify-center h-16 mb-3">
          {status === 'active' ? (
            <div className="flex items-end gap-1 h-12">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    gemini.isModelSpeaking
                      ? 'bg-nexid-gold'
                      : gemini.isMuted
                        ? 'bg-red-400/40'
                        : 'bg-white/20'
                  }`}
                  style={{
                    height: gemini.isModelSpeaking
                      ? `${20 + Math.random() * 80}%`
                      : gemini.isMuted
                        ? '10%'
                        : `${10 + Math.random() * 30}%`,
                    animationDelay: `${i * 50}ms`,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="text-[11px] font-mono text-neutral-500">
              {statusMessage}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          {status === 'ready' && (
            <button
              onClick={handleStart}
              className="px-6 py-2.5 rounded-xl bg-nexid-gold text-black text-[12px] font-display font-bold hover:bg-yellow-400 transition-colors"
            >
              Start Session
            </button>
          )}

          {status === 'active' && (
            <>
              <button
                onClick={gemini.toggleMute}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-[14px] border transition-colors ${
                  gemini.isMuted
                    ? 'bg-red-500/20 border-red-500/40 text-red-400'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                }`}
                title={gemini.isMuted ? 'Unmute' : 'Mute'}
              >
                {gemini.isMuted ? '🔇' : '🎙'}
              </button>

              <button
                onClick={handleEnd}
                className="px-5 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-[11px] font-display font-bold hover:bg-red-500/30 transition-colors"
              >
                End Session
              </button>
            </>
          )}

          {status === 'loading' && (
            <div className="text-[11px] font-mono text-neutral-500 animate-pulse">
              Initializing...
            </div>
          )}

          {status === 'completing' && (
            <div className="text-[11px] font-mono text-nexid-gold animate-pulse">
              Saving results...
            </div>
          )}
        </div>
      </div>

      {/* Transcript */}
      {gemini.transcript.length > 0 && (
        <div className="w-full bg-[#060606] border border-white/[.06] rounded-xl p-4 max-h-64 overflow-y-auto">
          <div className="text-[9px] font-mono uppercase text-neutral-500 mb-2">Live Transcript</div>
          <div className="space-y-2">
            {gemini.transcript.map((entry, i) => (
              <div key={i} className={`text-[11px] leading-relaxed ${entry.role === 'user' ? 'text-neutral-300' : 'text-nexid-gold/80'}`}>
                <span className="text-[9px] font-mono text-neutral-600 mr-1.5">
                  {entry.role === 'user' ? 'YOU' : 'AI'}
                </span>
                {entry.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score Display (after completion) */}
      {status === 'done' && scoresRef.current.overallScore != null && (
        <div className="w-full bg-[#060606] border border-nexid-gold/20 rounded-xl p-4 mt-4">
          <div className="text-[9px] font-mono uppercase text-nexid-gold mb-2">Session Score</div>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: 'Depth', value: scoresRef.current.depthScore },
              { label: 'Accuracy', value: scoresRef.current.accuracyScore },
              { label: 'Originality', value: scoresRef.current.originalityScore },
              { label: 'Overall', value: scoresRef.current.overallScore },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[20px] font-display font-bold text-white">{s.value ?? '—'}</div>
                <div className="text-[9px] font-mono text-neutral-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-4 mt-4 text-[11px] font-mono text-red-400">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
