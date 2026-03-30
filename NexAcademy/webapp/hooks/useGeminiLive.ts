'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// useGeminiLive — Client-side hook for Gemini Live API voice sessions
//
// Manages: WebSocket connection, mic capture (16kHz PCM), audio playback
// (24kHz PCM), transcription, tool calling, and session lifecycle.
// ─────────────────────────────────────────────────────────────────────────────

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const BUFFER_SIZE = 4096;

export type SessionPhase =
  | 'idle'
  | 'connecting'
  | 'active'
  | 'ending'
  | 'ended'
  | 'error';

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface TranscriptEntry {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}

interface UseGeminiLiveOptions {
  onToolCall?: (call: ToolCall) => Record<string, unknown> | Promise<Record<string, unknown>>;
  onTranscript?: (entry: TranscriptEntry) => void;
  onSessionEnd?: (reason: string) => void;
  onError?: (error: string) => void;
}

interface UseGeminiLiveReturn {
  phase: SessionPhase;
  transcript: TranscriptEntry[];
  isMuted: boolean;
  isModelSpeaking: boolean;
  durationSeconds: number;
  error: string | null;
  connect: (config: SessionConfig) => Promise<void>;
  disconnect: (reason?: string) => void;
  toggleMute: () => void;
}

interface SessionConfig {
  token: string;
  model: string;
  systemInstruction: string;
  voiceName: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  maxDurationSeconds: number;
}

// ── PCM Conversion Helpers ──────────────────────────────────────────────────

function float32ToPcm16Base64(float32: Float32Array): string {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToPcm16Float32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useGeminiLive(options: UseGeminiLiveOptions = {}): UseGeminiLiveReturn {
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const isMutedRef = useRef(false);
  const completedRef = useRef(false);
  const optionsRef = useRef(options);

  // Keep options ref current
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Duration timer
  useEffect(() => {
    if (phase === 'active') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setDurationSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

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
  }, []);

  // ── Audio Playback Queue ────────────────────────────────────────────────

  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  const drainPlaybackQueue = useCallback(async () => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;
    setIsModelSpeaking(true);

    while (playbackQueueRef.current.length > 0) {
      const chunk = playbackQueueRef.current.shift()!;
      if (!playbackCtxRef.current) {
        playbackCtxRef.current = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      }
      const ctx = playbackCtxRef.current;
      const buffer = ctx.createBuffer(1, chunk.length, OUTPUT_SAMPLE_RATE);
      buffer.getChannelData(0).set(chunk);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      // Wait for playback to finish
      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
      });
    }

    isPlayingRef.current = false;
    setIsModelSpeaking(false);
  }, []);

  // ── Connect ─────────────────────────────────────────────────────────────

  const connect = useCallback(async (config: SessionConfig) => {
    if (phase !== 'idle' && phase !== 'ended' && phase !== 'error') return;

    setPhase('connecting');
    setError(null);
    setTranscript([]);
    setDurationSeconds(0);
    playbackQueueRef.current = [];
    completedRef.current = false;

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: INPUT_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Ephemeral tokens must use the constrained v1alpha Live endpoint.
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${config.token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send the initial session configuration.
        const setupMessage = {
          config: {
            model: `models/${config.model}`,
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: config.voiceName,
                },
              },
            },
            systemInstruction: {
              parts: [{ text: config.systemInstruction }],
            },
            tools: config.tools.length > 0
              ? [{ functionDeclarations: config.tools }]
              : undefined,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        };
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = async (event) => {
        let msg: Record<string, unknown>;
        try {
          const text = typeof event.data === 'string'
            ? event.data
            : await (event.data as Blob).text();
          msg = JSON.parse(text);
        } catch {
          return;
        }

        // Setup complete
        if (msg.setupComplete) {
          setPhase('active');
          startMicCapture(stream, ws);
          return;
        }

        const serverContent = msg.serverContent as Record<string, unknown> | undefined;
        if (serverContent) {
          // Audio data
          const parts = (serverContent.modelTurn as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
          if (parts) {
            for (const part of parts) {
              const inlineData = part.inlineData as { data: string; mimeType: string } | undefined;
              if (inlineData?.data) {
                const pcm = base64ToPcm16Float32(inlineData.data);
                playbackQueueRef.current.push(pcm);
                drainPlaybackQueue();
              }
            }
          }

          // Input transcription (user speech)
          const inputTranscription = serverContent.inputTranscription as Record<string, unknown> | undefined;
          if (inputTranscription?.text) {
            const entry: TranscriptEntry = {
              role: 'user',
              text: String(inputTranscription.text),
              timestamp: Date.now(),
            };
            setTranscript((prev) => [...prev, entry]);
            optionsRef.current.onTranscript?.(entry);
          }

          // Output transcription (model speech)
          const outputTranscription = serverContent.outputTranscription as Record<string, unknown> | undefined;
          if (outputTranscription?.text) {
            const entry: TranscriptEntry = {
              role: 'agent',
              text: String(outputTranscription.text),
              timestamp: Date.now(),
            };
            setTranscript((prev) => [...prev, entry]);
            optionsRef.current.onTranscript?.(entry);
          }
        }

        // Tool calls
        const toolCall = msg.toolCall as { functionCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }> } | undefined;
        if (toolCall?.functionCalls) {
          for (const fc of toolCall.functionCalls) {
            const handler = optionsRef.current.onToolCall;
            const result = handler
              ? await handler({ id: fc.id, name: fc.name, args: fc.args })
              : { acknowledged: true };

            // Send tool response back
            ws.send(JSON.stringify({
              toolResponse: {
                functionResponses: [{
                  id: fc.id,
                  name: fc.name,
                  response: result,
                }],
              },
            }));
          }
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
        setPhase('error');
        cleanup();
        optionsRef.current.onError?.('WebSocket connection error');
      };

      ws.onclose = (event) => {
        if (!completedRef.current) {
          completedRef.current = true;
          const reason = event.reason || 'Connection closed';
          setPhase('ended');
          cleanup();
          optionsRef.current.onSessionEnd?.(reason);
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
      setPhase('error');
      cleanup();
      optionsRef.current.onError?.(message);
    }
  }, [phase, cleanup, drainPlaybackQueue]);

  // ── Microphone Capture ──────────────────────────────────────────────────

  const startMicCapture = useCallback((stream: MediaStream, ws: WebSocket) => {
    const audioCtx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) return;

      const float32 = e.inputBuffer.getChannelData(0);
      const base64 = float32ToPcm16Base64(float32);

      ws.send(JSON.stringify({
        realtimeInput: {
          audio: {
            data: base64,
            mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
          },
        },
      }));
    };

    source.connect(processor);
    // Connect to destination to keep the processor alive (required by some browsers)
    processor.connect(audioCtx.destination);
  }, []);

  // ── Disconnect ──────────────────────────────────────────────────────────

  const disconnect = useCallback((reason = 'User ended session') => {
    if (completedRef.current) return;
    completedRef.current = true;
    cleanup();
    setPhase('ended');
    optionsRef.current.onSessionEnd?.(reason);
  }, [cleanup]);

  // ── Mute Toggle ─────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      return next;
    });
  }, []);

  return {
    phase,
    transcript,
    isMuted,
    isModelSpeaking,
    durationSeconds,
    error,
    connect,
    disconnect,
    toggleMute,
  };
}
