"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API types (vendor-prefixed in some browsers)
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: { length: number; [index: number]: { [index: number]: { transcript: string } | undefined } | undefined } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AgentPhase =
  | "preflight"
  | "waiting_trigger"
  | "active"
  | "grading"
  | "completed";

type VoiceState = "idle" | "speaking" | "listening";

type TranscriptEntry = {
  role: "agent" | "user";
  text: string;
};

export interface ImmersiveAgentSessionProps {
  campaignId: number;
  courseKey: string;
  onComplete: (score: number | null) => void;
  onDismiss: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-course questions
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_QS: Record<string, string[]> = {
  nexid: [
    "Explain how NexID's identity layer differs from traditional KYC systems.",
    "What makes the behaviour-based multiplier system resistant to gaming?",
  ],
  "product-design": [
    "How does the Jobs-to-be-Done framework change how you define product requirements?",
    "Describe a situation where user research would contradict stakeholder assumptions.",
  ],
  "tiny-habits": [
    "How does anchoring a new habit to an existing routine improve consistency?",
    "Why does BJ Fogg argue that motivation alone is unreliable for behaviour change?",
  ],
  megaeth: [
    "How does MegaETH's real-time sequencer design achieve sub-millisecond latency?",
    "Explain how MegaETH maintains EVM compatibility while using a different execution model.",
  ],
};

const SESSION_DURATION = 40;
const BAR_COUNT = 24;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ImmersiveAgentSession({
  campaignId,
  courseKey,
  onComplete,
  onDismiss,
}: ImmersiveAgentSessionProps) {
  const [phase, setPhase] = useState<AgentPhase>("preflight");
  const [micAllowed, setMicAllowed] = useState(false);
  const [micTesting, setMicTesting] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [secsLeft, setSecsLeft] = useState(SESSION_DURATION);
  const [questionNum, setQuestionNum] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [waveBars, setWaveBars] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 4),
  );
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const questions = AGENT_QS[courseKey] ?? AGENT_QS.nexid;
  const totalQuestions = questions.length;

  // ── Cleanup ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveRef.current) clearInterval(waveRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* */ }
      }
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, []);

  // ── Wave animation ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "active") {
      if (waveRef.current) {
        clearInterval(waveRef.current);
        waveRef.current = null;
      }
      return;
    }

    waveRef.current = setInterval(() => {
      setWaveBars((prev) =>
        prev.map((_, i) => {
          if (voiceState === "speaking") {
            return 4 + Math.random() * 28 + Math.sin(Date.now() / 150 + i) * 8;
          }
          if (voiceState === "listening") {
            return 4 + Math.random() * 16 + Math.cos(Date.now() / 200 + i * 0.5) * 6;
          }
          return 4 + Math.sin(Date.now() / 400 + i) * 3;
        }),
      );
    }, 80);

    return () => {
      if (waveRef.current) {
        clearInterval(waveRef.current);
        waveRef.current = null;
      }
    };
  }, [phase, voiceState]);

  // ── Mic test ───────────────────────────────────────────────────────────
  const handleMicTest = useCallback(async () => {
    setMicTesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicAllowed(true);
    } catch {
      setMicAllowed(false);
    } finally {
      setMicTesting(false);
    }
  }, []);

  // ── Enter session (waiting for "I'm ready" trigger) ────────────────────
  const handleEnterSession = useCallback(() => {
    setPhase("waiting_trigger");
    // Start listening for "I'm ready"
    startTriggerListen();
  }, []);

  // ── Start the 40s timer ────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    setPhase("active");
    setSecsLeft(SESSION_DURATION);
    setQuestionNum(0);

    timerRef.current = setInterval(() => {
      setSecsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Ask first question
    setTimeout(() => askQuestion(0), 400);
  }, []);

  // Timer expired → end session
  useEffect(() => {
    if (secsLeft === 0 && phase === "active") {
      endSession();
    }
  }, [secsLeft, phase]);

  // ── Agent speaks ───────────────────────────────────────────────────────
  const agentSpeak = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        setVoiceState("speaking");
        setTranscript((prev) => [...prev, { role: "agent", text }]);

        if (typeof SpeechSynthesisUtterance === "undefined") {
          // Fallback: simulate speaking delay
          setTimeout(() => {
            setVoiceState("idle");
            resolve();
          }, 2000);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        synthRef.current = utterance;

        utterance.onend = () => {
          setVoiceState("idle");
          resolve();
        };
        utterance.onerror = () => {
          setVoiceState("idle");
          resolve();
        };

        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
      });
    },
    [],
  );

  // ── Listen for answer ──────────────────────────────────────────────────
  const listenForAnswer = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      setVoiceState("listening");

      const SpeechRecognitionAPI =
        typeof window !== "undefined"
          ? (window as unknown as Record<string, unknown>).SpeechRecognition ??
            (window as unknown as Record<string, unknown>).webkitSpeechRecognition
          : null;

      if (!SpeechRecognitionAPI) {
        // Fallback: auto-resolve after timeout
        setTimeout(() => {
          setVoiceState("idle");
          resolve("(speech recognition unavailable)");
        }, 5000);
        return;
      }

      const recognition = new (SpeechRecognitionAPI as new () => SpeechRecognitionInstance)();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognitionRef.current = recognition;

      let answered = false;

      recognition.onresult = (event) => {
        if (answered) return;
        answered = true;
        const result = event.results[0]?.[0]?.transcript ?? "";
        setTranscript((prev) => [...prev, { role: "user", text: result }]);
        setVoiceState("idle");
        resolve(result);
      };

      recognition.onerror = () => {
        if (!answered) {
          answered = true;
          setVoiceState("idle");
          resolve("");
        }
      };

      recognition.onend = () => {
        if (!answered) {
          answered = true;
          setVoiceState("idle");
          resolve("");
        }
      };

      recognition.start();

      // Auto-timeout after 15s of listening
      setTimeout(() => {
        if (!answered) {
          answered = true;
          try { recognition.stop(); } catch { /* */ }
          setVoiceState("idle");
          resolve("");
        }
      }, 15000);
    });
  }, []);

  // ── Listen for "I'm ready" trigger ─────────────────────────────────────
  function startTriggerListen() {
    const SpeechRecognitionAPI =
      typeof window !== "undefined"
        ? (window as unknown as Record<string, unknown>).SpeechRecognition ??
          (window as unknown as Record<string, unknown>).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionAPI) {
      // Fallback: auto-start after 3s
      setTimeout(() => startTimer(), 3000);
      return;
    }

    const recognition = new (SpeechRecognitionAPI as new () => SpeechRecognitionInstance)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i]?.[0]?.transcript?.toLowerCase() ?? "";
        if (text.includes("ready") || text.includes("i'm ready") || text.includes("im ready")) {
          try { recognition.stop(); } catch { /* */ }
          startTimer();
          return;
        }
      }
    };

    recognition.onerror = () => {
      // Fallback on error
      setTimeout(() => startTimer(), 2000);
    };

    recognition.start();

    // Auto-start after 10s if no trigger detected
    setTimeout(() => {
      if (phase === "waiting_trigger") {
        try { recognition.stop(); } catch { /* */ }
        startTimer();
      }
    }, 10000);
  }

  // ── Ask a question ─────────────────────────────────────────────────────
  async function askQuestion(index: number) {
    if (index >= totalQuestions || secsLeft <= 0) {
      endSession();
      return;
    }

    setQuestionNum(index);
    await agentSpeak(questions[index]);
    const answer = await listenForAnswer();

    if (answer && index + 1 < totalQuestions) {
      askQuestion(index + 1);
    } else {
      endSession();
    }
  }

  // ── End session ────────────────────────────────────────────────────────
  function endSession() {
    if (phase === "grading" || phase === "completed") return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* */ }
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();

    setPhase("grading");
    setVoiceState("idle");

    // Simulate grading delay then complete
    setTimeout(() => {
      setPhase("completed");
    }, 2000);
  }

  // ── Countdown ring geometry ────────────────────────────────────────────
  const ringRadius = 54;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress = secsLeft / SESSION_DURATION;
  const ringOffset = ringCircumference * (1 - ringProgress);
  const timerColor =
    secsLeft <= 5 ? "var(--red)" : secsLeft <= 10 ? "#f0a030" : "var(--green)";

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="agent-immersive">
      {/* Aurora Backdrop */}
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
        {/* ── Pre-Flight ─────────────────────────────────────────── */}
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
                <span>40 seconds, 2 questions</span>
              </div>
              <div className="agent-instr-item">
                <span className="agent-instr-num">2</span>
                <span>Say &quot;I&apos;m ready&quot; to trigger timer</span>
              </div>
              <div className="agent-instr-item">
                <span className="agent-instr-num">3</span>
                <span>Mic test required before proceeding</span>
              </div>
              <div className="agent-instr-item">
                <span className="agent-instr-num">4</span>
                <span>Agent evaluates understanding, not perfection</span>
              </div>
            </div>

            <div className="mic-test-box" style={{ marginTop: 20 }}>
              <div className="ey">Microphone Test</div>
              <div className="mic-bars">
                {[6, 10, 14, 18, 14, 10, 6].map((height, index) => (
                  <div
                    key={`mic-bar-${index}`}
                    className={`mic-bar ${micAllowed ? "mic-bar-ok" : ""}`}
                    style={{ height }}
                  />
                ))}
              </div>
              {!micAllowed ? (
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={handleMicTest}
                  disabled={micTesting}
                >
                  {micTesting ? "Testing..." : "Test Mic"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={handleEnterSession}
                >
                  Enter Live Session
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Waiting for trigger ────────────────────────────────── */}
        {phase === "waiting_trigger" && (
          <div className="agent-trigger-screen">
            <div className="agent-countdown-big">{SESSION_DURATION}</div>
            <div className="agent-trigger-hint">
              Say &quot;I&apos;m ready&quot; to start
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 24 }}
              onClick={startTimer}
            >
              Or click to start manually
            </button>
          </div>
        )}

        {/* ── Active Session ─────────────────────────────────────── */}
        {phase === "active" && (
          <>
            {/* Timer Ring */}
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

            {/* Question Counter */}
            <div className="agent-q-counter">
              Question {questionNum + 1} of {totalQuestions}
            </div>

            {/* Wave Visualizer */}
            <div className="agent-wave">
              {waveBars.map((height, i) => (
                <div
                  key={`wave-${i}`}
                  className="agent-wave-bar"
                  style={{
                    height: `${height}px`,
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

            {/* Transcript (last entry) */}
            {transcript.length > 0 && (
              <div className="agent-transcript">
                <div
                  className={`agent-transcript-entry ${
                    transcript[transcript.length - 1].role === "agent"
                      ? "agent-msg"
                      : "user-msg"
                  }`}
                >
                  <span className="agent-transcript-role">
                    {transcript[transcript.length - 1].role === "agent"
                      ? "Agent"
                      : "You"}
                    :
                  </span>{" "}
                  {transcript[transcript.length - 1].text}
                </div>
              </div>
            )}

            {/* Voice State Indicator */}
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
            <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 24 }}>
              {transcript.filter((t) => t.role === "user").length} of{" "}
              {totalQuestions} questions answered
            </div>
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => onComplete(null)}
            >
              End Session
            </button>
          </div>
        )}

        {/* ── Bottom controls (dismiss during preflight) ──────────── */}
        {phase === "preflight" && (
          <div className="agent-ctrl-row">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onDismiss}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
