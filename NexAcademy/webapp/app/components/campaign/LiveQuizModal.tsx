'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// LiveQuizModal — 40-Second AI Voice Quiz (2 Questions)
//
// Full-screen modal overlay. Triggered as a gate before campaign completion.
// Premium, immersive, mobile-first experience.
//
// Timer UX:
//   40s → 11s : GREEN (calm)
//   10s → 6s  : AMBER (nudge — "Wrap up your answer")
//   5s  → 1s  : RED (warning, pulse, glow)
//   0s         : Auto-complete
// ─────────────────────────────────────────────────────────────────────────────

interface LiveQuizModalProps {
  campaignId: number;
  campaignTitle: string;
  sponsorName: string;
  onComplete: (score: number | null) => void;
  onDismiss: () => void;
}

type Phase =
  | 'loading'
  | 'locked'
  | 'instructions'
  | 'requesting'
  | 'connecting'
  | 'live'
  | 'grading'
  | 'completed'
  | 'error';

const QUIZ_DURATION = 40;

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function timerColor(seconds: number): string {
  if (seconds <= 5) return 'text-red-500';
  if (seconds <= 10) return 'text-amber-400';
  return 'text-green-400';
}

function timerBarColor(seconds: number): string {
  if (seconds <= 5) return 'bg-red-500';
  if (seconds <= 10) return 'bg-amber-400';
  return 'bg-green-400';
}

function timerGlow(seconds: number): string {
  if (seconds <= 5) return 'shadow-[0_0_20px_rgba(239,68,68,0.4)]';
  if (seconds <= 10) return 'shadow-[0_0_12px_rgba(245,158,11,0.25)]';
  return '';
}

/** Soft 440Hz sine tone — single pip at the 10-second mark */
function playWarningTone() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available — ignore
  }
}

/** CSS keyframes injected once for the breathing pulse animation */
const BREATHE_STYLE_ID = 'nexid-breathe-keyframes';
function ensureBreatheKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(BREATHE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BREATHE_STYLE_ID;
  style.textContent = `@keyframes nexid-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}`;
  document.head.appendChild(style);
}

export default function LiveQuizModal({
  campaignId,
  campaignTitle,
  sponsorName,
  onComplete,
  onDismiss,
}: LiveQuizModalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(QUIZ_DURATION);
  const [score, setScore] = useState<number | null>(null);
  const [scores, setScores] = useState<{
    depthScore?: number;
    accuracyScore?: number;
    originalityScore?: number;
    overallScore?: number;
    humanConfidenceScore?: number;
    responseLatencyAvg?: number;
    naturalDisfluencyScore?: number;
    answerCoherenceScore?: number;
    semanticCorrectionScore?: number;
  }>({});
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([]);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [micTested, setMicTested] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [revealStage, setRevealStage] = useState<'flash' | 'score' | 'done'>('flash');
  const [animatedScore, setAnimatedScore] = useState(0);

  const [waveformData, setWaveformData] = useState<number[]>(new Array(20).fill(5));

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scoreReceivedRef = useRef(false);
  const sessionCompletedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const waveformFrameRef = useRef<number>(0);

  // Portal mount
  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Check for existing session on mount (completed, active, or initiated)
  useEffect(() => {
    let cancelled = false;

    async function checkExisting() {
      try {
        const res = await fetch('/api/agent/session', { headers: authHeaders() });
        if (!res.ok) { setPhase('instructions'); return; }
        const data = await res.json();
        const sessions = (data.sessions ?? []) as Array<{
          id: string; sessionType: string; campaignId: number | null;
          status: string; overallScore: number | null;
        }>;

        const match = sessions.find(
          (s) => s.sessionType === 'CAMPAIGN_ASSESSMENT' && s.campaignId === campaignId,
        );

        if (!cancelled) {
          if (!match) {
            setPhase('instructions');
          } else if (match.status === 'COMPLETED') {
            setScore(match.overallScore);
            sessionIdRef.current = match.id;
            setPhase('completed');
          } else if (match.status === 'ACTIVE' || match.status === 'WALLET_CHALLENGE') {
            // Session already initiated — lock re-entry
            sessionIdRef.current = match.id;
            setPhase('locked');
          } else {
            setPhase('instructions');
          }
        }
      } catch {
        if (!cancelled) setPhase('instructions');
      }
    }

    checkExisting();
    return () => { cancelled = true; };
  }, [campaignId]);

  // Mic test
  const testMic = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicTested(true);
    } catch (err) {
      const name = (err as DOMException)?.name;
      const message = err instanceof Error ? err.message : '';
      const policyDocument = document as Document & {
        permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
        featurePolicy?: { allowsFeature?: (feature: string) => boolean };
      };
      const policyApi = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;
      const blockedByDocumentPolicy =
        typeof policyApi?.allowsFeature === 'function'
          ? !policyApi.allowsFeature('microphone')
          : /permissions policy|microphone is not allowed in this document/i.test(message);

      if (blockedByDocumentPolicy) {
        setMicError('DOCUMENT_POLICY_BLOCKED');
        return;
      }

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        // Query Permissions API to distinguish browser-denied vs OS-blocked
        let permState: PermissionState | null = null;
        try {
          const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          permState = status.state;
        } catch { /* Permissions API not supported in this browser */ }

        console.error('[LiveQuiz] getUserMedia failed', {
          errorName: name,
          errorMessage: message,
          permissionsApiState: permState,
          blockedByDocumentPolicy,
          isSecureContext: window.isSecureContext,
          mediaDevicesAvailable: !!navigator.mediaDevices,
        });

        if (permState === 'granted') {
          // Browser has permission — OS is blocking Chrome's mic access
          setMicError('OS_BLOCKED');
        } else {
          setMicError('NEEDS_RELOAD');
        }
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setMicError('No microphone found. Please connect a microphone and try again.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setMicError('Microphone is in use by another app. Close other apps using the mic and try again.');
      } else if (!window.isSecureContext) {
        setMicError('Microphone access requires HTTPS. Please open this page over a secure connection.');
      } else {
        setMicError(`Could not access microphone (${name ?? 'unknown error'}). Please check your browser permissions.`);
      }
    }
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    if (playbackCtxRef.current) { playbackCtxRef.current.close().catch(() => {}); playbackCtxRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (waveformFrameRef.current) { cancelAnimationFrame(waveformFrameRef.current); waveformFrameRef.current = 0; }
    micAnalyserRef.current = null;
    playbackAnalyserRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // Complete session on server
  const completeOnServer = useCallback(async (
    sid: string,
    scoreData: {
      depthScore?: number; accuracyScore?: number; originalityScore?: number; overallScore?: number;
      notes?: string; humanConfidenceScore?: number; responseLatencyAvg?: number;
      semanticCorrectionScore?: number; naturalDisfluencyScore?: number; answerCoherenceScore?: number;
    },
    transcriptData: Array<{ role: string; text: string }>,
  ) => {
    if (sessionCompletedRef.current) return;
    sessionCompletedRef.current = true;

    try {
      await fetch('/api/agent/session/complete', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          sessionId: sid,
          durationSeconds: QUIZ_DURATION,
          depthScore: scoreData.depthScore,
          accuracyScore: scoreData.accuracyScore,
          originalityScore: scoreData.originalityScore,
          overallScore: scoreData.overallScore,
          scoringNotes: scoreData.notes ? { agentNotes: scoreData.notes } : undefined,
          transcript: transcriptData,
          // HCS fields
          humanConfidenceScore: scoreData.humanConfidenceScore,
          responseLatencyAvg: scoreData.responseLatencyAvg,
          semanticCorrectionScore: scoreData.semanticCorrectionScore,
          naturalDisfluencyScore: scoreData.naturalDisfluencyScore,
          answerCoherenceScore: scoreData.answerCoherenceScore,
        }),
      });
    } catch {
      // Best-effort
    }

    setScores(scoreData);
    setScore(scoreData.overallScore ?? null);
    setPhase('completed');
  }, []);

  // Start the full flow
  const handleStart = useCallback(async () => {
    setError(null);

    // Step 1: Request session slot
    setPhase('requesting');
    let sid: string;
    let sessionToken: string;

    try {
      const res = await fetch('/api/agent/session', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionType: 'CAMPAIGN_ASSESSMENT', campaignId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to request session');
      }
      const data = await res.json();
      sid = data.sessionId;
      sessionToken = data.sessionToken;
      sessionIdRef.current = sid;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request session');
      setPhase('error');
      return;
    }

    // Step 2: Start session
    try {
      const res = await fetch('/api/agent/session/start', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionToken, walletSignature: 'live-quiz-auto-' + Date.now() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to start session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
      setPhase('error');
      return;
    }

    // Step 3: Get Gemini token + config
    setPhase('connecting');
    let geminiConfig: {
      token: string;
      model: string;
      systemInstruction: string;
      voiceName: string;
      tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    };

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
      geminiConfig = await res.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setPhase('error');
      return;
    }

    // System instruction for 40-second, 2-question quiz
    const quizInstruction = `You are a NexID Academy AI quiz agent. This is a LIVE 40-SECOND QUIZ SESSION with 2 QUESTIONS.

PROTOCOL CONTEXT:
- Campaign: "${campaignTitle}"
- Protocol: ${sponsorName}

YOUR TASK:
1. Immediately say "Question one — " followed by your question about ${sponsorName}. Keep it under 15 words. (~3-5 seconds speech)
2. Listen to the user's answer for ~12-15 seconds.
3. Once they finish or pause, immediately say "Last one — " followed by a DIFFERENT question probing a DIFFERENT aspect. (~3-5 seconds speech)
4. Listen to the user's second answer for ~12-15 seconds.
5. After both answers (or when time is running low), call submit_scores with your evaluation of BOTH answers combined.
6. Then call end_session.

QUESTION TYPES (pick one per question, NEVER repeat the same type):
- ADVERSARIAL CORRECTION: State something subtly wrong about the protocol, ask "Is that correct?" — tests if they truly understand vs. agreeing blindly.
- VIDEO-SPECIFIC RECALL: Ask about a specific mechanism or detail from the campaign content — tests attention and retention.
- SPECULATIVE: "What would happen if [scenario]?" — tests reasoning depth beyond memorisation.
- TRAP: Frame a common misconception as fact, see if they catch it — tests genuine understanding.
- CONTRIBUTION: "How would you use [protocol feature] to solve [real problem]?" — tests practical application.

QUESTION GUIDELINES:
- Q1 and Q2 must test DIFFERENT aspects of the protocol using DIFFERENT question types.
- Focus on core mechanisms, not peripheral features.
- Keep each question under 15 words.

SCORING (call submit_scores — evaluate BOTH answers together):
- depthScore: Did they explain mechanisms, not just name them? (averaged across both)
- accuracyScore: Were technical details correct? (averaged across both)
- originalityScore: Did they use their own words vs. repeating docs? (averaged)
- overallScore: Weighted average, be fair but strict. 60+ is a pass.

CRITICAL RULES:
- Start Q1 with exactly: "Question one — [your question]"
- Start Q2 with exactly: "Last one — [your question]"
- Do NOT use filler words between Q1 answer and Q2. Go directly to Q2.
- Do NOT introduce yourself or greet. Jump straight to Question 1.
- Do NOT ask follow-up or clarification questions. Exactly 2 questions, nothing more.
- Do NOT speak for more than 5 seconds per question.
- After scoring, say NOTHING else — just call end_session.`;

    // Step 4: Connect to Gemini WebSocket
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?access_token=${geminiConfig.token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const localTranscript: Array<{ role: string; text: string }> = [];

      ws.onopen = () => {
        ws.send(JSON.stringify({
          setup: {
            model: `models/${geminiConfig.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: geminiConfig.voiceName },
                },
              },
            },
            systemInstruction: { parts: [{ text: quizInstruction }] },
            tools: geminiConfig.tools.length > 0
              ? [{ functionDeclarations: geminiConfig.tools }]
              : undefined,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }));
      };

      ws.onmessage = async (event) => {
        let msg: Record<string, unknown>;
        try {
          const text = typeof event.data === 'string' ? event.data : await (event.data as Blob).text();
          msg = JSON.parse(text);
        } catch { return; }

        if (msg.setupComplete) {
          setPhase('live');
          startMicCapture(stream, ws);
          startCountdown(sid, localTranscript);
          return;
        }

        const serverContent = msg.serverContent as Record<string, unknown> | undefined;
        if (serverContent) {
          const parts = (serverContent.modelTurn as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
          if (parts) {
            for (const part of parts) {
              const inlineData = part.inlineData as { data: string } | undefined;
              if (inlineData?.data) {
                setIsModelSpeaking(true);
                playAudioChunk(inlineData.data);
              }
            }
          }

          const inputT = serverContent.inputTranscription as Record<string, unknown> | undefined;
          if (inputT?.text) {
            const entry = { role: 'user', text: String(inputT.text) };
            localTranscript.push(entry);
            setTranscript((prev) => [...prev, entry]);
          }
          const outputT = serverContent.outputTranscription as Record<string, unknown> | undefined;
          if (outputT?.text) {
            const entry = { role: 'agent', text: String(outputT.text) };
            localTranscript.push(entry);
            setTranscript((prev) => [...prev, entry]);
            setIsModelSpeaking(false);
          }

          if (serverContent.turnComplete) {
            setIsModelSpeaking(false);
          }
        }

        // Tool calls
        const toolCall = msg.toolCall as { functionCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }> } | undefined;
        if (toolCall?.functionCalls) {
          for (const fc of toolCall.functionCalls) {
            if (fc.name === 'submit_scores') {
              scoreReceivedRef.current = true;
              setPhase('grading');
              const s = {
                depthScore: Number(fc.args.depthScore) || undefined,
                accuracyScore: Number(fc.args.accuracyScore) || undefined,
                originalityScore: Number(fc.args.originalityScore) || undefined,
                overallScore: Number(fc.args.overallScore) || undefined,
                notes: fc.args.notes ? String(fc.args.notes) : undefined,
                // HCS fields
                humanConfidenceScore: Number(fc.args.humanConfidenceScore) || undefined,
                responseLatencyAvg: Number(fc.args.responseLatencyAvg) || undefined,
                semanticCorrectionScore: Number(fc.args.semanticCorrectionScore) || undefined,
                naturalDisfluencyScore: Number(fc.args.naturalDisfluencyScore) || undefined,
                answerCoherenceScore: Number(fc.args.answerCoherenceScore) || undefined,
              };

              ws.send(JSON.stringify({
                toolResponse: {
                  functionResponses: [{ id: fc.id, name: fc.name, response: { acknowledged: true } }],
                },
              }));

              cleanup();
              await completeOnServer(sid, s, localTranscript);
            } else if (fc.name === 'end_session') {
              ws.send(JSON.stringify({
                toolResponse: {
                  functionResponses: [{ id: fc.id, name: fc.name, response: { acknowledged: true } }],
                },
              }));

              if (!scoreReceivedRef.current) {
                cleanup();
                await completeOnServer(sid, { overallScore: 50 }, localTranscript);
              }
            }
          }
        }
      };

      ws.onerror = () => {
        setError('Connection error');
        setPhase('error');
        cleanup();
      };

      ws.onclose = () => {
        if (!sessionCompletedRef.current) {
          completeOnServer(sid, { overallScore: 0 }, localTranscript);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setPhase('error');
      cleanup();
    }
  }, [campaignId, campaignTitle, sponsorName, cleanup, completeOnServer]);

  // Countdown
  const startCountdown = useCallback((sid: string, localTranscript: Array<{ role: string; text: string }>) => {
    setCountdown(QUIZ_DURATION);
    ensureBreatheKeyframes();
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (!scoreReceivedRef.current) {
            cleanup();
            completeOnServer(sid, { overallScore: 0, notes: 'Session timed out' }, localTranscript);
          }
          return 0;
        }
        // 10-second mark: haptic pulse + audio tone
        if (prev === 11) {
          navigator.vibrate?.(100);
          playWarningTone();
        }
        return prev - 1;
      });
    }, 1000);
  }, [cleanup, completeOnServer]);

  // Mic capture (16kHz PCM) + AnalyserNode for waveform
  const startMicCapture = useCallback((stream: MediaStream, ws: WebSocket) => {
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);

    // AnalyserNode for mic waveform
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    micAnalyserRef.current = analyser;

    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

      ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ data: btoa(binary), mimeType: 'audio/pcm;rate=16000' }],
        },
      }));
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    // Start waveform animation loop
    const barCount = 20;
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    function updateWaveform() {
      const mic = micAnalyserRef.current;
      const playback = playbackAnalyserRef.current;
      const bars = new Array<number>(barCount);

      if (mic) mic.getByteFrequencyData(freqData);
      const step = Math.max(1, Math.floor(freqData.length / barCount));
      for (let i = 0; i < barCount; i++) {
        bars[i] = Math.max(5, (freqData[i * step] ?? 0) / 255 * 100);
      }

      // Blend playback analyser if AI is speaking
      if (playback) {
        const pData = new Uint8Array(playback.frequencyBinCount);
        playback.getByteFrequencyData(pData);
        const pStep = Math.max(1, Math.floor(pData.length / barCount));
        for (let i = 0; i < barCount; i++) {
          bars[i] = Math.max(bars[i], (pData[i * pStep] ?? 0) / 255 * 100);
        }
      }

      setWaveformData(bars);
      waveformFrameRef.current = requestAnimationFrame(updateWaveform);
    }
    waveformFrameRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  // Audio playback (24kHz PCM) with AnalyserNode for waveform
  const playAudioChunk = useCallback((base64: string) => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
      const analyser = playbackCtxRef.current.createAnalyser();
      analyser.fftSize = 64;
      playbackAnalyserRef.current = analyser;
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
    }
    const ctx = playbackCtxRef.current;
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (playbackAnalyserRef.current) {
      src.connect(playbackAnalyserRef.current);
      playbackAnalyserRef.current.connect(ctx.destination);
    } else {
      src.connect(ctx.destination);
    }
    src.start();
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (!mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-md">
      <div className="w-full max-w-lg mx-4 max-h-[100dvh] overflow-y-auto">

        {/* ── Loading ─────────────────────────────────────────── */}
        {phase === 'loading' && (
          <div className="text-center py-20">
            <div className="w-10 h-10 mx-auto rounded-full border-2 border-white/10 border-t-green-400 animate-spin" />
            <div className="mt-4 text-[11px] font-mono text-neutral-500">Checking session...</div>
          </div>
        )}

        {/* ── Locked (reload/re-entry protection) ────────────── */}
        {phase === 'locked' && (
          <div className="text-center py-16 animate-in fade-in duration-300">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-red-500/10 border-2 border-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-red-400/80 mb-2">Session Locked</div>
            <h2 className="font-display font-bold text-xl text-white mb-3">Session Already In Progress</h2>
            <p className="text-[12px] text-neutral-500 max-w-xs mx-auto leading-relaxed mb-6">
              This quiz session has already been initiated and cannot be restarted. Each session is single-use.
            </p>
            <button
              onClick={onDismiss}
              className="text-[12px] font-mono text-neutral-400 px-6 py-2.5 rounded-xl border border-white/10 hover:text-white hover:border-white/20 transition-all active:scale-95"
            >
              Go Back
            </button>
          </div>
        )}

        {/* ── Instructions ────────────────────────────────────── */}
        {phase === 'instructions' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400/80 mb-1">{sponsorName}</div>
              <h2 className="font-display font-bold text-2xl md:text-3xl text-white mb-1">Live AI Quiz</h2>
              <div className="text-[12px] text-neutral-500">40-second voice challenge &middot; 2 questions</div>
            </div>

            {/* Rules */}
            <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-5 md:p-6 mb-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 mb-4">Before You Begin</div>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-green-400">1</span>
                  </div>
                  <div>
                    <div className="text-[13px] text-white font-medium">Test your microphone</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">Make sure your mic is working before starting.</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-amber-400">2</span>
                  </div>
                  <div>
                    <div className="text-[13px] text-white font-medium">One chance only</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">Once you start, you <span className="text-red-400">cannot retake</span> this quiz.</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-red-400">3</span>
                  </div>
                  <div>
                    <div className="text-[13px] text-white font-medium">40 seconds, 2 questions</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">Timer starts immediately. Be ready before you click.</div>
                  </div>
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
              {micError === 'OS_BLOCKED' ? (
                <div className="mt-2 text-[11px] text-red-400">
                  Chrome has permission but your OS is blocking mic access. On Windows: <span className="font-semibold">Settings → Privacy → Microphone → allow Chrome</span>. On Mac: <span className="font-semibold">System Settings → Privacy & Security → Microphone → enable Chrome</span>. Then reload and try again.
                </div>
              ) : micError === 'DOCUMENT_POLICY_BLOCKED' ? (
                <div className="mt-2 text-[11px] text-red-400">
                  This page is blocking microphone access before the browser prompt. Reload after the latest site update is deployed. If it still persists, the assessment route needs its <span className="font-semibold">Permissions-Policy</span> header to allow microphone access.
                </div>
              ) : micError === 'NEEDS_RELOAD' ? (
                <div className="mt-2 text-[11px] text-red-400">
                  Microphone access was denied. Allow it via the lock icon in your browser address bar, then{' '}
                  <button
                    onClick={() => window.location.reload()}
                    className="underline font-semibold hover:text-red-300"
                  >
                    reload the page
                  </button>
                  {' '}and try again.
                </div>
              ) : micError ? (
                <div className="mt-2 text-[11px] text-red-400">{micError}</div>
              ) : null}
            </div>

            {/* Start Button */}
            <button
              onClick={handleStart}
              disabled={!micTested}
              className="w-full py-4 rounded-2xl bg-green-500 text-black text-[14px] font-display font-bold transition-all hover:bg-green-400 hover:shadow-[0_0_30px_rgba(34,197,94,0.3)] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              Start Live Quiz
            </button>

            {!micTested && (
              <div className="text-center text-[10px] text-neutral-600 mt-3">Test your microphone to unlock</div>
            )}

            {/* Dismiss */}
            <button
              onClick={onDismiss}
              className="w-full mt-3 py-2 text-[11px] font-mono text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* ── Connecting ──────────────────────────────────────── */}
        {(phase === 'requesting' || phase === 'connecting') && (
          <div className="text-center py-20 animate-in fade-in duration-300">
            <div className="w-14 h-14 mx-auto rounded-full border-2 border-green-500/20 border-t-green-400 animate-spin" />
            <div className="mt-5 text-[12px] font-mono text-green-400">
              {phase === 'requesting' ? 'Securing session...' : 'Connecting to AI agent...'}
            </div>
            <div className="mt-1 text-[10px] text-neutral-600">This takes a few seconds</div>
          </div>
        )}

        {/* ── Live Session ────────────────────────────────────── */}
        {(phase === 'live' || phase === 'grading') && (
          <div className="animate-in fade-in duration-300">
            {/* Live indicator */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${phase === 'grading' ? 'bg-amber-400' : 'bg-red-500'} animate-pulse`} />
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                  {phase === 'grading' ? 'Scoring' : 'Live'}
                </span>
              </div>
              <div className="text-[9px] font-mono text-neutral-600">{sponsorName}</div>
            </div>

            {/* Timer — THE CENTERPIECE */}
            <div className={`text-center mb-6 transition-all duration-500 ${timerGlow(countdown)} rounded-3xl py-6`}>
              <div
                className={`text-5xl md:text-6xl font-mono font-black tabular-nums tracking-tight transition-colors duration-500 ${timerColor(countdown)}`}
                style={countdown <= 5 && countdown > 0 ? { animation: 'nexid-breathe 0.5s ease-in-out infinite' } : undefined}
              >
                {formatTime(countdown)}
              </div>
              {countdown <= 10 && countdown > 5 && (
                <div className="mt-2 text-[11px] font-mono text-amber-400/80 animate-pulse">Wrap up your answer</div>
              )}
              {countdown <= 5 && countdown > 0 && (
                <div className="mt-2 text-[11px] font-mono text-red-400 animate-pulse font-bold">Time almost up</div>
              )}
            </div>

            {/* Timer Bar */}
            <div className="h-1.5 w-full rounded-full bg-white/[.06] overflow-hidden mb-6">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${timerBarColor(countdown)}`}
                style={{ width: `${(countdown / QUIZ_DURATION) * 100}%` }}
              />
            </div>

            {/* Voice Visualizer — driven by AnalyserNode frequency data */}
            <div className="flex items-end justify-center gap-[3px] h-16 md:h-20 mb-6">
              {waveformData.map((height, i) => (
                <div
                  key={i}
                  className={`w-[3px] md:w-1 rounded-full transition-all duration-75 ${
                    height > 20 ? (isModelSpeaking ? 'bg-green-400' : 'bg-nexid-gold') : 'bg-white/10'
                  }`}
                  style={{ height: `${Math.max(5, height)}%` }}
                />
              ))}
            </div>

            {/* Status text */}
            <div className="text-center text-[12px] text-neutral-500">
              {phase === 'grading'
                ? 'Evaluating your answers...'
                : isModelSpeaking
                  ? 'AI is asking a question...'
                  : 'Listening to your answer...'}
            </div>

            {/* Live transcript */}
            {transcript.length > 0 && (
              <div className="mt-5 bg-white/[.02] border border-white/[.06] rounded-xl p-3 max-h-28 overflow-y-auto">
                {transcript.map((t, i) => (
                  <div key={i} className={`text-[11px] mb-1.5 leading-relaxed ${t.role === 'user' ? 'text-neutral-300' : 'text-green-400/70'}`}>
                    <span className="text-[9px] font-mono text-neutral-600 mr-1.5 uppercase">{t.role === 'user' ? 'You' : 'AI'}</span>
                    {t.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Completed — two-stage reveal ──────────────────── */}
        {phase === 'completed' && (
          <CompletedReveal
            score={score}
            scores={scores}
            transcript={transcript}
            revealStage={revealStage}
            setRevealStage={setRevealStage}
            animatedScore={animatedScore}
            setAnimatedScore={setAnimatedScore}
            onContinue={() => onComplete(score)}
          />
        )}

        {/* ── Error ───────────────────────────────────────────── */}
        {phase === 'error' && (
          <div className="text-center py-16 animate-in fade-in duration-300">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="text-[12px] font-mono text-red-400 mb-5">{error ?? 'Something went wrong'}</div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={async () => {
                  if (sessionIdRef.current) {
                    try {
                      await fetch('/api/agent/session/cancel', {
                        method: 'POST',
                        headers: authHeaders(),
                        body: JSON.stringify({ sessionId: sessionIdRef.current }),
                      });
                    } catch {}
                    sessionIdRef.current = null;
                  }
                  setPhase('instructions');
                  setError(null);
                  sessionCompletedRef.current = false;
                  scoreReceivedRef.current = false;
                }}
                className="text-[12px] font-mono text-neutral-400 px-5 py-2.5 rounded-xl border border-white/10 hover:text-white hover:border-white/20 transition-all active:scale-95"
              >
                Try Again
              </button>
              <button
                onClick={onDismiss}
                className="text-[12px] font-mono text-neutral-600 px-5 py-2.5 rounded-xl border border-white/[.06] hover:text-neutral-400 transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// ── Completed Reveal Component ─────────────────────────────────────────────

function CompletedReveal({
  score,
  scores,
  transcript,
  revealStage,
  setRevealStage,
  animatedScore,
  setAnimatedScore,
  onContinue,
}: {
  score: number | null;
  scores: {
    depthScore?: number; accuracyScore?: number; originalityScore?: number; overallScore?: number;
    humanConfidenceScore?: number; responseLatencyAvg?: number; naturalDisfluencyScore?: number;
    answerCoherenceScore?: number; semanticCorrectionScore?: number;
  };
  transcript: Array<{ role: string; text: string }>;
  revealStage: 'flash' | 'score' | 'done';
  setRevealStage: (s: 'flash' | 'score' | 'done') => void;
  animatedScore: number;
  setAnimatedScore: (n: number) => void;
  onContinue: () => void;
}) {
  // Stage 1 → Stage 2 after 2s
  useEffect(() => {
    if (revealStage !== 'flash') return;
    const t = setTimeout(() => setRevealStage('score'), 2000);
    return () => clearTimeout(t);
  }, [revealStage, setRevealStage]);

  // Score count-up animation
  useEffect(() => {
    if (revealStage !== 'score' || score === null) return;
    const target = score;
    const duration = 1500;
    const start = performance.now();
    let frame: number;

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setAnimatedScore(Math.round(eased * target));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setRevealStage('done');
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [revealStage, score, setAnimatedScore, setRevealStage]);

  // Stage 1: "SESSION COMPLETE" flash
  if (revealStage === 'flash') {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-700">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center animate-in zoom-in-50 duration-500">
          <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-[0.35em] text-green-400/80 mb-2">Session Complete</div>
        <div className="h-[1px] w-16 bg-gradient-to-r from-transparent via-green-500/40 to-transparent" />
      </div>
    );
  }

  // Stage 2+3: Score reveal + breakdown
  const displayScore = revealStage === 'done' ? (score ?? 0) : animatedScore;
  const passed = (score ?? 0) >= 60;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400/80 mb-3">Session Complete</div>
        <h2 className="font-display font-bold text-2xl text-white">Quiz Finished</h2>
      </div>

      {/* Score — animated count-up */}
      {score !== null && (
        <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-6 mb-4">
          <div className="text-center mb-5">
            <div className={`text-7xl font-display font-black tabular-nums transition-colors duration-500 ${passed ? 'text-green-400' : 'text-red-400'}`}>
              {displayScore}
            </div>
            <div className={`text-[12px] font-bold mt-1 transition-opacity duration-500 ${revealStage === 'done' ? 'opacity-100' : 'opacity-0'} ${passed ? 'text-green-400' : 'text-red-400'}`}>
              {passed ? 'PASSED' : 'BELOW THRESHOLD'}
            </div>
          </div>

          {/* Breakdown — slides in after count-up */}
          {revealStage === 'done' && (scores.depthScore != null || scores.accuracyScore != null || scores.originalityScore != null) && (
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/[.06] animate-in fade-in slide-in-from-bottom-2 duration-500">
              {[
                { label: 'Depth', value: scores.depthScore },
                { label: 'Accuracy', value: scores.accuracyScore },
                { label: 'Originality', value: scores.originalityScore },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-xl font-display font-bold text-white">{s.value ?? '\u2014'}</div>
                  <div className="text-[9px] font-mono text-neutral-600 uppercase">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* HCS Badge — Human Confidence Score */}
      {revealStage === 'done' && scores.humanConfidenceScore != null && (
        <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-4 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600">Human Confidence</div>
            <div className={`text-lg font-display font-black ${
              scores.humanConfidenceScore >= 70 ? 'text-green-400' :
              scores.humanConfidenceScore >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {scores.humanConfidenceScore}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Coherence', value: scores.answerCoherenceScore },
              { label: 'Naturalness', value: scores.naturalDisfluencyScore },
              { label: 'Latency', value: scores.responseLatencyAvg != null ? `${scores.responseLatencyAvg.toFixed(1)}s` : null },
              { label: 'Correction', value: scores.semanticCorrectionScore },
            ].filter((s) => s.value != null).map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-[10px] text-neutral-600">{s.label}</span>
                <span className="text-[11px] font-mono text-neutral-400">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcript — only after full reveal */}
      {revealStage === 'done' && transcript.length > 0 && (
        <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-4 mb-6 max-h-36 overflow-y-auto animate-in fade-in duration-500">
          <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 mb-2">Transcript</div>
          {transcript.map((t, i) => (
            <div key={i} className={`text-[11px] mb-1.5 leading-relaxed ${t.role === 'user' ? 'text-neutral-300' : 'text-green-400/70'}`}>
              <span className="text-[9px] font-mono text-neutral-600 mr-1.5 uppercase">{t.role === 'user' ? 'You' : 'AI'}</span>
              {t.text}
            </div>
          ))}
        </div>
      )}

      {/* Continue button — visible after reveal */}
      {revealStage === 'done' && (
        <button
          onClick={onContinue}
          className="w-full py-4 rounded-2xl bg-green-500 text-black text-[14px] font-display font-bold transition-all hover:bg-green-400 hover:shadow-[0_0_30px_rgba(34,197,94,0.3)] active:scale-[0.98] animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          Continue
        </button>
      )}
    </div>
  );
}
