"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// ImmersiveAgentSession — 40s live Gemini voice assessment (2 real campaign
// questions). Functionality is identical to LiveQuizModal: same session API,
// same Gemini Live WebSocket wiring, same grading path. Only the UI differs —
// an immersive aurora/wave/ring presentation instead of the modal shell.
// ─────────────────────────────────────────────────────────────────────────────

type AgentPhase =
  | "loading"
  | "locked"
  | "preflight"
  | "requesting"
  | "connecting"
  | "active"
  | "grading"
  | "completed"
  | "error";

type VoiceState = "idle" | "speaking" | "listening";

type TranscriptEntry = { role: "agent" | "user"; text: string };

type LiveQuizQuestion = {
  id: string;
  questionText: string;
  gradingRubric: string | null;
  difficulty: number;
};

type ScoreData = {
  depthScore?: number;
  accuracyScore?: number;
  originalityScore?: number;
  overallScore?: number;
  notes?: string;
  humanConfidenceScore?: number;
  responseLatencyAvg?: number;
  semanticCorrectionScore?: number;
  naturalDisfluencyScore?: number;
  answerCoherenceScore?: number;
};

export interface ImmersiveAgentSessionProps {
  campaignId: number;
  campaignTitle: string;
  sponsorName: string;
  onComplete: (score: number | null) => void;
  onDismiss: () => void;
}

const SESSION_DURATION = 40;
const BAR_COUNT = 24;

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function mergeTranscriptText(previousText: string, nextText: string): string {
  const previous = previousText.trim();
  const next = nextText.trim();
  if (!previous) return next;
  if (!next) return previous;
  if (next === previous) return previous;
  if (next.startsWith(previous)) return next;
  if (previous.startsWith(next) || previous.endsWith(next)) return previous;
  const maxOverlap = Math.min(previous.length, next.length);
  let overlap = 0;
  for (let i = maxOverlap; i > 0; i--) {
    if (previous.slice(-i).toLowerCase() === next.slice(0, i).toLowerCase()) {
      overlap = i;
      break;
    }
  }
  const suffix = next.slice(overlap);
  const separator = suffix && !/[\s([{/"'-]$/.test(previous) && !/^[.,!?;:)\]}]/.test(suffix) ? " " : "";
  return `${previous}${separator}${suffix}`.trim();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasAnyUserAnswer(transcript: TranscriptEntry[]): boolean {
  return transcript.some((entry) => entry.role === "user" && countWords(entry.text) >= 1);
}

function hasEnoughQuizAnswers(transcript: TranscriptEntry[]): boolean {
  const userTurns = transcript.filter((entry) => entry.role === "user" && countWords(entry.text) >= 2);
  const totalUserWords = userTurns.reduce((sum, entry) => sum + countWords(entry.text), 0);
  return userTurns.length >= 2 || totalUserWords >= 8;
}

function countUserWords(transcript: TranscriptEntry[]): number {
  return transcript
    .filter((entry) => entry.role === "user")
    .reduce((sum, entry) => sum + countWords(entry.text), 0);
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeQuizPromptText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hasRequiredScoreData(s: ScoreData): boolean {
  return (
    s.depthScore != null &&
    s.accuracyScore != null &&
    s.originalityScore != null &&
    s.overallScore != null
  );
}

function buildLiveQuizInstruction(
  campaignTitle: string,
  sponsorName: string,
  quizQuestions: LiveQuizQuestion[],
): string {
  const [firstQuestion, secondQuestion] = quizQuestions;
  const questionBlocks = quizQuestions
    .map((question, index) => {
      const publicLabel = index === 0 ? "Question one" : "Last one";
      return [
        `${index + 1}.`,
        `- Public label: ${publicLabel}`,
        `- Question ID: ${question.id}`,
        `- Ask exactly: ${question.questionText}`,
        `- Hidden grading rubric: ${question.gradingRubric ?? "No rubric provided"}`,
      ].join("\n");
    })
    .join("\n\n");

  return `You are a NexID Academy live assessment agent running a fixed 40-second campaign verification.
You are scoring the user, but you must never reveal the scoring rubric.

CAMPAIGN:
- Campaign: "${campaignTitle}"
- Protocol: ${sponsorName}

LIVE QUIZ FORMAT:
This session uses exactly 2 stored FREE_TEXT questions from the campaign pool.

SELECTED QUESTIONS:
${questionBlocks}

STRICT RULES:
- Ask only the two selected questions above, in the listed order.
- Start question 1 with exactly: "Question one - ${firstQuestion.questionText}"
- Start question 2 with exactly: "Last one - ${secondQuestion.questionText}"
- Do not invent, replace, paraphrase, reorder, or add any other questions.
- Do not reveal the hidden grading rubric or hint.
- After asking each question, listen to the user's answer. Do not ask follow-up questions.
- After the second answer, or if time is almost up, call submit_scores based only on how well each answer matches its paired question and hidden grading rubric.
- Penalize off-topic or missing answers.
- Include concise notes that mention what was strong or weak in each answer.
- Do not greet or introduce yourself. Begin immediately with question one.
- After submit_scores, say nothing else and call end_session.

SCORING RULES:
- Score each answer against its paired question and hidden grading rubric, then average the two answers into the final subscores.
- Accuracy measures factual correctness, not confidence or speaking style.
- Use accuracyScore 0-10 only if the user is blank, off-topic, or fully factually wrong.
- Use accuracyScore 20-40 for partially related but mostly incorrect answers.
- Use accuracyScore 50-70 for mixed answers with some correct facts and some mistakes or omissions.
- Use accuracyScore 75-90 for mostly correct, specific answers with minor gaps.
- Use accuracyScore 91-100 only for precise, technically sound answers.
- Do not give accuracyScore 0 just because an answer is brief if it is still materially correct.
- Depth rewards explanation of mechanisms and tradeoffs, not answer length alone.
- Originality rewards independent phrasing and reasoning, not random speculation.
- overallScore must stay close to this weighted blend: 45% accuracy, 35% depth, 20% originality.
- If an answer contains some correct protocol facts, accuracyScore should not be 0.
- In notes, mention question one and last one separately.`;
}

export default function ImmersiveAgentSession({
  campaignId,
  campaignTitle,
  sponsorName,
  onComplete,
  onDismiss,
}: ImmersiveAgentSessionProps) {
  const [phase, setPhase] = useState<AgentPhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [micTested, setMicTested] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [micTesting, setMicTesting] = useState(false);
  const [secsLeft, setSecsLeft] = useState(SESSION_DURATION);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [score, setScore] = useState<number | null>(null);
  const [scores, setScores] = useState<ScoreData>({});
  const [recoveringSession, setRecoveringSession] = useState(false);
  const [waveBars, setWaveBars] = useState<number[]>(() => Array.from({ length: BAR_COUNT }, () => 4));

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const waveformFrameRef = useRef<number>(0);
  const scoreReceivedRef = useRef(false);
  const sessionCompletedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const countdownStartedRef = useRef(false);
  const zeroAccuracyRetryRef = useRef(false);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlaybackRunningRef = useRef(false);
  // Timestamp (ms) until which mic input is suppressed. Set a short hold
  // after the agent finishes speaking to avoid capturing its speaker echo
  // tail / reverb that the model would otherwise hear as an interruption.
  const micSuppressUntilRef = useRef(0);
  const activeTranscriptIndexRef = useRef<{ user: number | null; agent: number | null }>({
    user: null,
    agent: null,
  });

  const questionTotal = 2;
  const agentTurnsAsked = transcript.filter((t) => t.role === "agent").length;
  const questionNum = Math.min(Math.max(agentTurnsAsked, 1), questionTotal);

  // ── Cleanup helpers ─────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close().catch(() => {});
      playbackCtxRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (waveformFrameRef.current) {
      cancelAnimationFrame(waveformFrameRef.current);
      waveformFrameRef.current = 0;
    }
    playbackQueueRef.current = [];
    isPlaybackRunningRef.current = false;
    countdownStartedRef.current = false;
    micAnalyserRef.current = null;
    playbackAnalyserRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const resetLocalSessionState = useCallback(() => {
    sessionIdRef.current = null;
    scoreReceivedRef.current = false;
    sessionCompletedRef.current = false;
    countdownStartedRef.current = false;
    zeroAccuracyRetryRef.current = false;
    setSecsLeft(SESSION_DURATION);
    setTranscript([]);
    setScores({});
    setScore(null);
    setVoiceState("idle");
    setWaveBars(Array.from({ length: BAR_COUNT }, () => 4));
    activeTranscriptIndexRef.current = { user: null, agent: null };
  }, []);

  const cancelCurrentSession = useCallback(async () => {
    const sid = sessionIdRef.current;
    cleanup();
    if (sid) {
      try {
        await fetch("/api/agent/session/cancel", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ sessionId: sid }),
        });
      } catch {
        // Best effort
      }
    }
    resetLocalSessionState();
  }, [cleanup, resetLocalSessionState]);

  // ── Check for existing session on mount ────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function checkExisting() {
      try {
        const res = await fetch("/api/agent/session", { headers: authHeaders() });
        if (!res.ok) {
          if (!cancelled) setPhase("preflight");
          return;
        }
        const data = await res.json();
        const sessions = (data.sessions ?? []) as Array<{
          id: string;
          sessionType: string;
          campaignId: number | null;
          status: string;
          overallScore: number | null;
        }>;

        const match = sessions.find(
          (s) => s.sessionType === "CAMPAIGN_ASSESSMENT" && s.campaignId === campaignId,
        );

        if (cancelled) return;

        if (!match) {
          setPhase("preflight");
        } else if (match.status === "COMPLETED" && match.overallScore != null) {
          setScore(match.overallScore);
          sessionIdRef.current = match.id;
          setPhase("completed");
        } else if (match.status === "COMPLETED") {
          resetLocalSessionState();
          setPhase("preflight");
        } else if (match.status === "ACTIVE" || match.status === "WALLET_CHALLENGE") {
          sessionIdRef.current = match.id;
          setPhase("locked");
        } else {
          setPhase("preflight");
        }
      } catch {
        if (!cancelled) setPhase("preflight");
      }
    }

    checkExisting();
    return () => {
      cancelled = true;
    };
  }, [campaignId, resetLocalSessionState]);

  // ── Mic test ───────────────────────────────────────────────────────────
  const handleMicTest = useCallback(async () => {
    setMicError(null);
    setMicTesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicTested(true);
    } catch (err) {
      const name = (err as DOMException)?.name;
      const message = err instanceof Error ? err.message : "";
      const policyDocument = document as Document & {
        permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
        featurePolicy?: { allowsFeature?: (feature: string) => boolean };
      };
      const policyApi = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;
      const blockedByDocumentPolicy =
        typeof policyApi?.allowsFeature === "function"
          ? !policyApi.allowsFeature("microphone")
          : /permissions policy|microphone is not allowed in this document/i.test(message);

      if (blockedByDocumentPolicy) {
        setMicError("Microphone is blocked by document policy. Reload the page and try again.");
      } else if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMicError("Microphone access was denied. Allow mic access from the browser and OS, then reload.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMicError("No microphone found. Please connect a microphone and try again.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setMicError("Microphone is in use by another app. Close other apps and try again.");
      } else if (!window.isSecureContext) {
        setMicError("Microphone access requires HTTPS.");
      } else {
        setMicError(`Could not access microphone (${name ?? "unknown error"}).`);
      }
    } finally {
      setMicTesting(false);
    }
  }, []);

  // ── Transcript merge helper ────────────────────────────────────────────
  const upsertTranscriptEntry = useCallback(
    (role: "user" | "agent", text: string, localTranscript: TranscriptEntry[]) => {
      const normalizedText = text.trim();
      if (!normalizedText) return;

      const otherRole = role === "user" ? "agent" : "user";
      activeTranscriptIndexRef.current[otherRole] = null;

      const activeIndex = activeTranscriptIndexRef.current[role];
      if (activeIndex != null && localTranscript[activeIndex]) {
        localTranscript[activeIndex] = {
          ...localTranscript[activeIndex],
          text: mergeTranscriptText(localTranscript[activeIndex].text, normalizedText),
        };
      } else {
        localTranscript.push({ role, text: normalizedText });
        activeTranscriptIndexRef.current[role] = localTranscript.length - 1;
      }

      setTranscript([...localTranscript]);
    },
    [],
  );

  // ── Audio playback (24kHz PCM) with AnalyserNode ───────────────────────
  const drainPlaybackQueue = useCallback(async () => {
    if (isPlaybackRunningRef.current) return;
    isPlaybackRunningRef.current = true;
    setVoiceState("speaking");

    while (playbackQueueRef.current.length > 0) {
      const chunk = playbackQueueRef.current.shift()!;

      if (!playbackCtxRef.current) {
        playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
        const analyser = playbackCtxRef.current.createAnalyser();
        analyser.fftSize = 64;
        analyser.connect(playbackCtxRef.current.destination);
        playbackAnalyserRef.current = analyser;
      }

      const ctx = playbackCtxRef.current;
      const buffer = ctx.createBuffer(1, chunk.length, 24000);
      buffer.getChannelData(0).set(chunk);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      if (playbackAnalyserRef.current) {
        src.connect(playbackAnalyserRef.current);
      } else {
        src.connect(ctx.destination);
      }
      src.start();

      await new Promise<void>((resolve) => {
        src.onended = () => resolve();
      });
    }

    isPlaybackRunningRef.current = false;
    // Hold the mic closed for a short window so the speaker echo tail
    // doesn't leak back into the model's VAD as user input.
    micSuppressUntilRef.current = Date.now() + 400;
    setVoiceState("listening");
  }, []);

  const playAudioChunk = useCallback(
    (base64: string) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
      }
      playbackQueueRef.current.push(float32);
      void drainPlaybackQueue();
    },
    [drainPlaybackQueue],
  );

  // ── Complete session on server ─────────────────────────────────────────
  const completeOnServer = useCallback(
    async (sid: string, scoreData: ScoreData, transcriptData: TranscriptEntry[]) => {
      if (sessionCompletedRef.current) return;
      sessionCompletedRef.current = true;

      try {
        const res = await fetch("/api/agent/session/complete", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            sessionId: sid,
            durationSeconds: SESSION_DURATION,
            depthScore: scoreData.depthScore,
            accuracyScore: scoreData.accuracyScore,
            originalityScore: scoreData.originalityScore,
            overallScore: scoreData.overallScore,
            scoringNotes: scoreData.notes ? { agentNotes: scoreData.notes } : undefined,
            transcript: transcriptData,
            humanConfidenceScore: scoreData.humanConfidenceScore,
            responseLatencyAvg: scoreData.responseLatencyAvg,
            semanticCorrectionScore: scoreData.semanticCorrectionScore,
            naturalDisfluencyScore: scoreData.naturalDisfluencyScore,
            answerCoherenceScore: scoreData.answerCoherenceScore,
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? "Failed to finalize live assessment");
        }
      } catch (err) {
        sessionCompletedRef.current = false;
        await cancelCurrentSession();
        setError(err instanceof Error ? err.message : "Failed to finalize live assessment");
        setPhase("error");
        return;
      }

      setScores(scoreData);
      setScore(scoreData.overallScore ?? null);
      setPhase("completed");
    },
    [cancelCurrentSession],
  );

  // ── Countdown — mirrors LiveQuizModal logic ────────────────────────────
  const startCountdown = useCallback(
    (_sid: string, localTranscript: TranscriptEntry[]) => {
      if (countdownStartedRef.current) return;
      countdownStartedRef.current = true;

      setSecsLeft(SESSION_DURATION);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSecsLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            if (!scoreReceivedRef.current) {
              const hasAnswers = hasAnyUserAnswer(localTranscript);
              const ws = wsRef.current;

              if (hasAnswers && ws?.readyState === WebSocket.OPEN) {
                setPhase("grading");
                ws.send(
                  JSON.stringify({
                    clientContent: {
                      turns: [
                        {
                          role: "user",
                          parts: [
                            {
                              text: "Time is up. Based only on the conversation so far, call submit_scores now and then call end_session.",
                            },
                          ],
                        },
                      ],
                      turnComplete: true,
                    },
                  }),
                );

                setTimeout(() => {
                  if (!scoreReceivedRef.current && !sessionCompletedRef.current) {
                    void (async () => {
                      await cancelCurrentSession();
                      setError("The live assessment timed out before a valid score was returned. Please try again.");
                      setPhase("error");
                    })();
                  }
                }, 4000);
              } else {
                void (async () => {
                  await cancelCurrentSession();
                  setError("The live assessment ended before enough answers were captured. Please try again.");
                  setPhase("error");
                })();
              }
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [cancelCurrentSession],
  );

  // ── Mic capture (16kHz PCM) + AnalyserNode for wave ────────────────────
  const startMicCapture = useCallback((stream: MediaStream, ws: WebSocket) => {
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    micAnalyserRef.current = analyser;

    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;

      // Half-duplex: never stream mic input while the agent is speaking (or
      // has pending audio chunks queued for playback) and for a short trailing
      // hold afterwards. This prevents the model from hearing its own speech
      // through the speakers and self-interrupting mid-question.
      if (
        isPlaybackRunningRef.current
        || playbackQueueRef.current.length > 0
        || Date.now() < micSuppressUntilRef.current
      ) {
        return;
      }

      const float32 = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      ws.send(
        JSON.stringify({
          realtimeInput: {
            audio: { data: btoa(binary), mimeType: "audio/pcm;rate=16000" },
          },
        }),
      );
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    const freqData = new Uint8Array(analyser.frequencyBinCount);

    function updateWaveform() {
      const mic = micAnalyserRef.current;
      const playback = playbackAnalyserRef.current;
      const bars = new Array<number>(BAR_COUNT);

      if (mic) mic.getByteFrequencyData(freqData);
      const step = Math.max(1, Math.floor(freqData.length / BAR_COUNT));
      for (let i = 0; i < BAR_COUNT; i++) {
        bars[i] = Math.max(4, ((freqData[i * step] ?? 0) / 255) * 36);
      }

      if (playback) {
        const pData = new Uint8Array(playback.frequencyBinCount);
        playback.getByteFrequencyData(pData);
        const pStep = Math.max(1, Math.floor(pData.length / BAR_COUNT));
        for (let i = 0; i < BAR_COUNT; i++) {
          bars[i] = Math.max(bars[i], ((pData[i * pStep] ?? 0) / 255) * 36);
        }
      }

      setWaveBars(bars);
      waveformFrameRef.current = requestAnimationFrame(updateWaveform);
    }
    waveformFrameRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  // ── Start full session flow ────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    setError(null);

    // Step 1: Request session slot
    setPhase("requesting");
    let sid: string;
    let sessionToken: string;

    try {
      const res = await fetch("/api/agent/session", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionType: "CAMPAIGN_ASSESSMENT", campaignId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to request session");
      }
      const data = await res.json();
      sid = data.sessionId;
      sessionToken = data.sessionToken;
      sessionIdRef.current = sid;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request session");
      setPhase("error");
      return;
    }

    // Step 2: Start session
    try {
      const res = await fetch("/api/agent/session/start", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionToken, walletSignature: "live-quiz-auto-" + Date.now() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to start session");
      }
    } catch (err) {
      await cancelCurrentSession();
      setError(err instanceof Error ? err.message : "Failed to start session");
      setPhase("error");
      return;
    }

    // Step 3: Get Gemini token + config
    setPhase("connecting");
    let geminiConfig: {
      token: string;
      model: string;
      systemInstruction: string;
      voiceName: string;
      tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
      quizQuestions?: LiveQuizQuestion[];
    };

    try {
      const res = await fetch("/api/agent/session/token", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionId: sid }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to get session config");
      }
      geminiConfig = await res.json();
    } catch (err) {
      await cancelCurrentSession();
      setError(err instanceof Error ? err.message : "Failed to connect");
      setPhase("error");
      return;
    }

    const quizQuestions = (geminiConfig.quizQuestions ?? [])
      .map((question) => ({
        ...question,
        questionText: normalizeQuizPromptText(question.questionText),
        gradingRubric: question.gradingRubric ? normalizeQuizPromptText(question.gradingRubric) : null,
      }))
      .filter((question) => question.questionText.length > 0 && (question.gradingRubric?.length ?? 0) > 0)
      .slice(0, 2);

    if (quizQuestions.length < 2) {
      await cancelCurrentSession();
      setError(
        "This campaign needs at least 2 active free-text questions with grading rubrics for the live assessment.",
      );
      setPhase("error");
      return;
    }

    const quizInstruction = buildLiveQuizInstruction(campaignTitle, sponsorName, quizQuestions);

    // Step 4: Connect to Gemini WebSocket
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${geminiConfig.token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const localTranscript: TranscriptEntry[] = [];
      setTranscript([]);
      activeTranscriptIndexRef.current = { user: null, agent: null };
      playbackQueueRef.current = [];
      isPlaybackRunningRef.current = false;
      countdownStartedRef.current = false;
      zeroAccuracyRetryRef.current = false;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${geminiConfig.model}`,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: geminiConfig.voiceName },
                  },
                },
              },
              systemInstruction: { parts: [{ text: quizInstruction }] },
              tools:
                geminiConfig.tools.length > 0
                  ? [{ functionDeclarations: geminiConfig.tools }]
                  : undefined,
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }),
        );
      };

      ws.onmessage = async (event) => {
        let msg: Record<string, unknown>;
        try {
          const text = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
          msg = JSON.parse(text);
        } catch {
          return;
        }

        if (msg.setupComplete) {
          setPhase("active");
          setVoiceState("listening");
          startMicCapture(stream, ws);
          return;
        }

        const serverContent = msg.serverContent as Record<string, unknown> | undefined;
        if (serverContent) {
          const parts = (serverContent.modelTurn as Record<string, unknown>)?.parts as
            | Array<Record<string, unknown>>
            | undefined;
          if (parts) {
            for (const part of parts) {
              const inlineData = part.inlineData as { data: string } | undefined;
              if (inlineData?.data) {
                startCountdown(sid, localTranscript);
                playAudioChunk(inlineData.data);
              }
            }
          }

          const inputT = serverContent.inputTranscription as Record<string, unknown> | undefined;
          if (inputT?.text) {
            upsertTranscriptEntry("user", String(inputT.text), localTranscript);
          }
          const outputT = serverContent.outputTranscription as Record<string, unknown> | undefined;
          if (outputT?.text) {
            startCountdown(sid, localTranscript);
            upsertTranscriptEntry("agent", String(outputT.text), localTranscript);
          }

          if (serverContent.turnComplete) {
            activeTranscriptIndexRef.current.agent = null;
          }
        }

        const toolCall = msg.toolCall as
          | { functionCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }> }
          | undefined;
        if (toolCall?.functionCalls) {
          for (const fc of toolCall.functionCalls) {
            if (fc.name === "submit_scores") {
              if (!hasEnoughQuizAnswers(localTranscript)) {
                ws.send(
                  JSON.stringify({
                    toolResponse: {
                      functionResponses: [
                        {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            error:
                              "Not enough user answers yet. Ask both quiz questions and wait for the user to respond before scoring.",
                          },
                        },
                      ],
                    },
                  }),
                );
                continue;
              }

              const s: ScoreData = {
                depthScore: parseOptionalNumber(fc.args.depthScore),
                accuracyScore: parseOptionalNumber(fc.args.accuracyScore),
                originalityScore: parseOptionalNumber(fc.args.originalityScore),
                overallScore: parseOptionalNumber(fc.args.overallScore),
                notes: fc.args.notes ? String(fc.args.notes) : undefined,
                humanConfidenceScore: parseOptionalNumber(fc.args.humanConfidenceScore),
                responseLatencyAvg: parseOptionalNumber(fc.args.responseLatencyAvg),
                semanticCorrectionScore: parseOptionalNumber(fc.args.semanticCorrectionScore),
                naturalDisfluencyScore: parseOptionalNumber(fc.args.naturalDisfluencyScore),
                answerCoherenceScore: parseOptionalNumber(fc.args.answerCoherenceScore),
              };

              if (!hasRequiredScoreData(s)) {
                ws.send(
                  JSON.stringify({
                    toolResponse: {
                      functionResponses: [
                        {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            error:
                              "submit_scores must include numeric depthScore, accuracyScore, originalityScore, and overallScore.",
                          },
                        },
                      ],
                    },
                  }),
                );
                continue;
              }

              if (
                s.accuracyScore === 0 &&
                countUserWords(localTranscript) >= 16 &&
                !zeroAccuracyRetryRef.current
              ) {
                zeroAccuracyRetryRef.current = true;
                ws.send(
                  JSON.stringify({
                    toolResponse: {
                      functionResponses: [
                        {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            error:
                              "accuracyScore of 0 is reserved for blank, off-topic, or fully incorrect answers. The transcript contains substantive user answers. Re-evaluate both answers against their hidden rubrics and resubmit scores.",
                          },
                        },
                      ],
                    },
                  }),
                );
                continue;
              }

              scoreReceivedRef.current = true;
              setPhase("grading");

              ws.send(
                JSON.stringify({
                  toolResponse: {
                    functionResponses: [{ id: fc.id, name: fc.name, response: { acknowledged: true } }],
                  },
                }),
              );

              cleanup();
              await completeOnServer(sid, s, localTranscript);
            } else if (fc.name === "end_session") {
              if (!scoreReceivedRef.current) {
                ws.send(
                  JSON.stringify({
                    toolResponse: {
                      functionResponses: [
                        {
                          id: fc.id,
                          name: fc.name,
                          response: {
                            error: hasEnoughQuizAnswers(localTranscript)
                              ? "Call submit_scores before ending the session."
                              : "Do not end yet. Ask both quiz questions and wait for the user answers first.",
                          },
                        },
                      ],
                    },
                  }),
                );
                continue;
              }

              ws.send(
                JSON.stringify({
                  toolResponse: {
                    functionResponses: [{ id: fc.id, name: fc.name, response: { acknowledged: true } }],
                  },
                }),
              );
            }
          }
        }
      };

      ws.onerror = () => {
        setError("Connection error");
        setPhase("error");
        void cancelCurrentSession();
      };

      ws.onclose = (e) => {
        if (!sessionCompletedRef.current) {
          setError(`Connection closed (code ${e.code}${e.reason ? ": " + e.reason : ""}). Please try again.`);
          setPhase("error");
          void cancelCurrentSession();
        }
      };
    } catch (err) {
      await cancelCurrentSession();
      setError(err instanceof Error ? err.message : "Failed to connect");
      setPhase("error");
    }
  }, [
    campaignId,
    campaignTitle,
    sponsorName,
    cancelCurrentSession,
    cleanup,
    completeOnServer,
    playAudioChunk,
    startCountdown,
    startMicCapture,
    upsertTranscriptEntry,
  ]);

  // ── Countdown ring geometry ────────────────────────────────────────────
  const ringRadius = 54;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress = secsLeft / SESSION_DURATION;
  const ringOffset = ringCircumference * (1 - ringProgress);
  const timerColor = secsLeft <= 5 ? "var(--red)" : secsLeft <= 10 ? "#f0a030" : "var(--green)";

  const latestTranscript = transcript.length > 0 ? transcript[transcript.length - 1] : null;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="agent-immersive">
      <div className="agent-aurora">
        <div
          className="agent-aurora-orb agent-aurora-a"
          style={{
            opacity: voiceState === "speaking" ? 0.7 : voiceState === "listening" ? 0.5 : 0.3,
          }}
        />
        <div
          className="agent-aurora-orb agent-aurora-b"
          style={{
            opacity: voiceState === "speaking" ? 0.6 : voiceState === "listening" ? 0.5 : 0.25,
          }}
        />
        <div
          className="agent-aurora-orb agent-aurora-c"
          style={{
            opacity: voiceState === "listening" ? 0.6 : voiceState === "speaking" ? 0.4 : 0.2,
          }}
        />
      </div>

      <div className="agent-ui">
        {/* ── Loading ────────────────────────────────────────────── */}
        {phase === "loading" && (
          <div className="agent-grading">
            <div
              style={{
                fontSize: 12,
                color: "var(--t3)",
                fontFamily: "var(--mono)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              Checking session...
            </div>
          </div>
        )}

        {/* ── Locked (existing active session) ───────────────────── */}
        {phase === "locked" && (
          <div className="agent-preflight">
            <div
              style={{
                fontFamily: "var(--dis)",
                fontWeight: 800,
                fontSize: 24,
                color: "#fff",
                marginBottom: 12,
              }}
            >
              Session Already In Progress
            </div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 20, maxWidth: 360 }}>
              A live assessment is still marked active for this campaign. Reset it to start again.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn btn-gold"
                disabled={recoveringSession}
                onClick={async () => {
                  setRecoveringSession(true);
                  await cancelCurrentSession();
                  setRecoveringSession(false);
                  setPhase("preflight");
                  setError(null);
                }}
              >
                {recoveringSession ? "Resetting..." : "Reset Session"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
                Back
              </button>
            </div>
          </div>
        )}

        {/* ── Pre-flight (mic test + start) ──────────────────────── */}
        {phase === "preflight" && (
          <div className="agent-preflight">
            <div
              style={{
                fontFamily: "var(--dis)",
                fontWeight: 800,
                fontSize: 28,
                color: "#fff",
                marginBottom: 20,
              }}
            >
              Live Session Guidelines
            </div>

            <div className="agent-instructions">
              <div className="agent-instr-item">
                <span className="agent-instr-num">1</span>
                <span>40 seconds, 2 questions from this campaign</span>
              </div>
              <div className="agent-instr-item">
                <span className="agent-instr-num">2</span>
                <span>Timer starts when the AI begins speaking</span>
              </div>
              <div className="agent-instr-item">
                <span className="agent-instr-num">3</span>
                <span>Mic test required before proceeding</span>
              </div>
              <div className="agent-instr-item">
                <span className="agent-instr-num">4</span>
                <span>One attempt only — no retake</span>
              </div>
            </div>

            <div className="mic-test-box" style={{ marginTop: 20 }}>
              <div className="ey">Microphone Test</div>
              <div className="mic-bars">
                {[6, 10, 14, 18, 14, 10, 6].map((height, index) => (
                  <div
                    key={`mic-bar-${index}`}
                    className={`mic-bar ${micTested ? "mic-bar-ok" : ""}`}
                    style={{ height }}
                  />
                ))}
              </div>
              {!micTested ? (
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={handleMicTest}
                  disabled={micTesting}
                >
                  {micTesting ? "Testing..." : "Test Mic"}
                </button>
              ) : (
                <button type="button" className="btn btn-gold" onClick={handleStart}>
                  Start Live Assessment
                </button>
              )}
              {micError && (
                <div style={{ fontSize: 11, color: "var(--red)", marginTop: 10, maxWidth: 320 }}>
                  {micError}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Requesting / Connecting ────────────────────────────── */}
        {(phase === "requesting" || phase === "connecting") && (
          <div className="agent-grading">
            <div
              style={{
                fontFamily: "var(--dis)",
                fontWeight: 800,
                fontSize: 22,
                color: "#fff",
                marginBottom: 12,
              }}
            >
              {phase === "requesting" ? "Securing Session" : "Connecting to Agent"}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--t3)",
                fontFamily: "var(--mono)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              This takes a few seconds...
            </div>
          </div>
        )}

        {/* ── Active Session ─────────────────────────────────────── */}
        {phase === "active" && (
          <>
            <div className="agent-timer-ring-wrap">
              <svg width="130" height="130" viewBox="0 0 130 130">
                <circle
                  cx="65"
                  cy="65"
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="4"
                />
                <circle
                  cx="65"
                  cy="65"
                  r={ringRadius}
                  fill="none"
                  stroke={timerColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 65 65)"
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s ease" }}
                />
              </svg>
              <div className="agent-timer-num" style={{ color: timerColor }}>
                {secsLeft}
              </div>
            </div>

            <div className="agent-q-counter">
              Question {questionNum} of {questionTotal}
            </div>

            <div className="agent-wave">
              {waveBars.map((height, i) => (
                <div
                  key={`wave-${i}`}
                  className="agent-wave-bar"
                  style={{
                    height: `${Math.max(4, height)}px`,
                    background:
                      voiceState === "speaking"
                        ? "var(--gold)"
                        : voiceState === "listening"
                        ? "var(--green)"
                        : "rgba(255,255,255,0.15)",
                    transition: "height 80ms ease, background 0.3s ease",
                  }}
                />
              ))}
            </div>

            {latestTranscript && (
              <div className="agent-transcript">
                <div
                  className={`agent-transcript-entry ${
                    latestTranscript.role === "agent" ? "agent-msg" : "user-msg"
                  }`}
                >
                  <span className="agent-transcript-role">
                    {latestTranscript.role === "agent" ? "Agent" : "You"}:
                  </span>{" "}
                  {latestTranscript.text}
                </div>
              </div>
            )}

            <div className="agent-voice-state">
              {voiceState === "speaking"
                ? "Agent is speaking..."
                : voiceState === "listening"
                ? "Listening to your answer..."
                : "Processing..."}
            </div>
          </>
        )}

        {/* ── Grading ────────────────────────────────────────────── */}
        {phase === "grading" && (
          <div className="agent-grading">
            <div
              style={{
                fontFamily: "var(--dis)",
                fontWeight: 800,
                fontSize: 22,
                color: "#fff",
                marginBottom: 12,
              }}
            >
              Evaluating Session
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--t3)",
                fontFamily: "var(--mono)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              Analyzing depth, accuracy, and originality...
            </div>
          </div>
        )}

        {/* ── Completed ──────────────────────────────────────────── */}
        {phase === "completed" && (
          <div className="agent-completed">
            <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
            <div
              style={{
                fontFamily: "var(--dis)",
                fontWeight: 800,
                fontSize: 22,
                color: "#fff",
                marginBottom: 8,
              }}
            >
              Session Complete
            </div>
            {score !== null ? (
              <>
                <div
                  style={{
                    fontFamily: "var(--dis)",
                    fontWeight: 900,
                    fontSize: 56,
                    color: score >= 60 ? "var(--green)" : "var(--red)",
                    marginBottom: 4,
                  }}
                >
                  {score}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: score >= 60 ? "var(--green)" : "var(--red)",
                    fontFamily: "var(--mono)",
                    marginBottom: 20,
                  }}
                >
                  {score >= 60 ? "PASSED" : "BELOW THRESHOLD"}
                </div>
                {(scores.depthScore != null || scores.accuracyScore != null || scores.originalityScore != null) && (
                  <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
                    {[
                      { label: "Depth", value: scores.depthScore },
                      { label: "Accuracy", value: scores.accuracyScore },
                      { label: "Originality", value: scores.originalityScore },
                    ].map((s) => (
                      <div key={s.label} style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: 18, color: "#fff" }}>
                          {s.value ?? "—"}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--t4)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 24, maxWidth: 320 }}>
                Your transcript was captured, but no numeric score was returned.
              </div>
            )}
            <button type="button" className="btn btn-gold" onClick={() => onComplete(score)}>
              Continue
            </button>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────── */}
        {phase === "error" && (
          <div className="agent-preflight">
            <div
              style={{
                fontFamily: "var(--dis)",
                fontWeight: 800,
                fontSize: 22,
                color: "#fff",
                marginBottom: 10,
              }}
            >
              Session Error
            </div>
            <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 20, maxWidth: 360 }}>
              {error ?? "Something went wrong"}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn btn-gold"
                disabled={recoveringSession}
                onClick={async () => {
                  setRecoveringSession(true);
                  await cancelCurrentSession();
                  setRecoveringSession(false);
                  setPhase("preflight");
                  setError(null);
                }}
              >
                {recoveringSession ? "Resetting..." : "Try Again"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── Back control on pre-flight ─────────────────────────── */}
        {phase === "preflight" && (
          <div className="agent-ctrl-row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
