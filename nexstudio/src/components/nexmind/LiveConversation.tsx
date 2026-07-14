"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/product/Icon";
import type { NexMindSession, ProposalField } from "./types";

type RecognitionEventLike = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function recognitionConstructor() {
  const target = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return target.SpeechRecognition || target.webkitSpeechRecognition;
}

function clock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function LiveConversation({ session, fields, onClose, onSend, onComplete, onPersist }: {
  session: NexMindSession;
  fields: ProposalField[];
  onClose: () => void;
  onSend: (text: string) => Promise<string | null>;
  onComplete: () => Promise<void>;
  onPersist: (partial: string | null, liveState: "listening" | "understanding" | "speaking" | "paused" | "reviewing") => Promise<void>;
}) {
  const [speaker, setSpeaker] = useState<"user" | "nexmind" | "reviewing" | "waiting">("reviewing");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [captured, setCaptured] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState({ low: 0.02, mid: 0.02, high: 0.02, pressure: 0.02 });
  const recognition = useRef<RecognitionLike | null>(null);
  const media = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const frame = useRef<number | null>(null);
  const shouldListen = useRef(true);
  const pausedRef = useRef(false);
  const mutedRef = useRef(false);
  const partialRef = useRef("");
  const questions = session.messages.filter((message) => message.speaker === "NEXMIND" && message.text.includes("?")).length;
  const latestAssistant = [...session.messages].reverse().find((message) => message.speaker !== "USER")?.text;
  const liveText = interim || captured || latestAssistant || "Listening for your response.";
  const reputation = session.purpose === "REPUTATION_ENHANCEMENT";

  useEffect(() => { partialRef.current = [captured, interim].filter(Boolean).join(" ").trim(); }, [captured, interim]);
  useEffect(() => { const timer = window.setInterval(() => setElapsed((value) => value + 1), 1_000); return () => window.clearInterval(timer); }, []);

  const startRecognition = useCallback(() => {
    if (recognition.current) {
      try { recognition.current.start(); setSpeaker("user"); } catch { /* It may already be active. */ }
      return;
    }
    const Recognition = recognitionConstructor();
    if (!Recognition) { setError("Live transcription is not available in this browser. Type your response below."); return; }
    const instance = new Recognition();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = navigator.language || "en-US";
    instance.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText.trim()) setCaptured((value) => `${value} ${finalText}`.trim());
      setInterim(interimText.trim());
      setSpeaker("user");
    };
    instance.onerror = (event) => { if (event.error !== "aborted" && event.error !== "no-speech") setError(`Microphone transcription stopped: ${event.error}.`); };
    instance.onend = () => {
      if (shouldListen.current && !pausedRef.current && !mutedRef.current) {
        try { instance.start(); } catch { /* The browser can still be completing its previous recognition cycle. */ }
      }
    };
    recognition.current = instance;
    try { instance.start(); setSpeaker("user"); } catch { setError("The browser could not start live transcription."); }
  }, []);

  useEffect(() => {
    let disposed = false;
    void navigator.mediaDevices?.getUserMedia({ audio: true }).then((stream) => {
      if (disposed) { stream.getTracks().forEach((track) => track.stop()); return; }
      media.current = stream;
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      audio.current = context;
      const bins = new Uint8Array(analyser.frequencyBinCount);
      const average = (start: number, end: number) => {
        let total = 0;
        for (let index = start; index < end; index += 1) total += bins[index] || 0;
        return total / Math.max(1, end - start) / 255;
      };
      const sample = () => {
        analyser.getByteFrequencyData(bins);
        const low = average(1, 9); const mid = average(9, 36); const high = average(36, 90);
        setLevels({ low, mid, high, pressure: Math.min(1, low * 0.55 + mid * 0.35 + high * 0.1) });
        frame.current = requestAnimationFrame(sample);
      };
      sample();
      startRecognition();
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Microphone permission was not granted."));
    return () => {
      disposed = true;
      shouldListen.current = false;
      recognition.current?.abort();
      media.current?.getTracks().forEach((track) => track.stop());
      if (frame.current) cancelAnimationFrame(frame.current);
      void audio.current?.close();
      window.speechSynthesis?.cancel();
    };
  }, [startRecognition]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const partial = partialRef.current;
      void onPersist(partial || null, paused ? "paused" : speaker === "user" ? "listening" : speaker === "nexmind" ? "speaking" : "reviewing");
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [onPersist, paused, speaker]);

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    pausedRef.current = next;
    shouldListen.current = !next && !muted;
    if (next) recognition.current?.stop(); else startRecognition();
    media.current?.getAudioTracks().forEach((track) => { track.enabled = !next && !muted; });
    if (next) window.speechSynthesis?.cancel();
    setSpeaker(next ? "waiting" : "user");
    void onPersist(partialRef.current || null, next ? "paused" : "listening");
  };

  const toggleMic = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    shouldListen.current = !next && !paused;
    media.current?.getAudioTracks().forEach((track) => { track.enabled = !next && !paused; });
    if (next) recognition.current?.stop(); else startRecognition();
  };

  const submit = async () => {
    const response = (typed || partialRef.current).trim();
    if (!response) { setSpeaker("reviewing"); await onComplete(); return; }
    recognition.current?.stop();
    shouldListen.current = false;
    setSpeaker("reviewing");
    await onPersist(response, "understanding");
    const reply = await onSend(response);
    setTyped(""); setCaptured(""); setInterim("");
    if (reply) {
      setSpeaker("nexmind");
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(reply);
        utterance.onend = () => { setSpeaker("user"); shouldListen.current = !pausedRef.current && !mutedRef.current; if (shouldListen.current) startRecognition(); };
        window.speechSynthesis.speak(utterance);
      } else { setSpeaker("user"); shouldListen.current = !pausedRef.current && !mutedRef.current; if (shouldListen.current) startRecognition(); }
    } else { setSpeaker("user"); shouldListen.current = !pausedRef.current && !mutedRef.current; if (shouldListen.current) startRecognition(); }
  };

  const style = {
    "--audio-low": levels.low,
    "--audio-mid": levels.mid,
    "--audio-high": levels.high,
    "--speech-envelope": levels.pressure,
    "--orb-pressure": levels.pressure,
    "--orb-detail": levels.mid,
    "--orb-onset": levels.high,
    "--orb-flow": levels.low,
  } as CSSProperties;
  const stateLabel = paused ? "Paused" : speaker === "user" ? "Listening" : speaker === "nexmind" ? "NexMind speaking" : "Understanding";
  return <section className={`live-layer open ${reputation ? "reputation-live" : "creation-live"} nexmind-live`} data-speaker={speaker} aria-label={`Live ${reputation ? "Reputation enhancement" : "creative direction"}`} style={style}>
    <div className="live-ambient" />
    <div className="live-stage">
      <header className="live-header"><div className="live-brand"><img src="/nexmarkets-mark.png" alt="" /><div><b>NexMind</b><span>{reputation ? "Reputation refinement" : "Studio direction"}</span></div></div><div className="live-state"><i /><span>{stateLabel}</span><time>{clock(elapsed)}</time></div><button className="live-context-trigger" onClick={() => setContextOpen(!contextOpen)} aria-label="Open captured context" aria-expanded={contextOpen}><Icon name={reputation ? "eye" : "file"} size="sm" /></button><button className="close-button" onClick={onClose} aria-label="Leave and save this live session"><Icon name="close" size="sm" /></button></header>
      <main className="live-centre orb-live-centre"><div className="nex-presence" aria-hidden="true"><div className="presence-field"><div className="presence-shadow" /><div className="nex-orb"><i className="orb-surface" /><i className="orb-depth" /><i className="orb-current one" /><i className="orb-current two" /><i className="orb-pulse one" /><i className="orb-pulse two" /><i className="orb-core" /></div></div><div className="voice-legend"><span className="voice-you"><i />You</span><span className="voice-nexmind"><i />NexMind</span></div></div><div className="live-copy"><div className="live-progress"><b>{String(Math.min(questions + 1, 5)).padStart(2, "0")}</b><span>/ 05</span><em>{reputation ? "Reputation" : "Direction"}</em></div><span className={`speaker-key ${speaker}`}>{stateLabel}</span><p className="live-transcript">{liveText}</p><small>{error || (reputation ? "Your answers stay private unless you choose a public field during review." : "Interrupt at any point. The source and your confirmed choices remain in the brief.")}</small></div></main>
      <footer className="live-controls"><button className="live-control" onClick={togglePause} aria-label={paused ? "Resume session" : "Pause session"}><Icon name={paused ? "play" : "pause"} /></button><button className="live-control" onClick={toggleMic} aria-label={muted ? "Resume microphone" : "Mute microphone"}><Icon name="mic" /></button><button className="live-control source" onClick={() => setContextOpen(!contextOpen)}><Icon name={reputation ? "eye" : "file"} /><span>{reputation ? "Sources" : "Brief"}</span></button><label className="live-text"><input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Type a response" /><button onClick={() => void submit()} aria-label="Send typed response"><Icon name="send" size="sm" /></button></label><button className="live-control next" onClick={() => void submit()}><span>{questions >= 4 ? "Review" : "Continue"}</span><Icon name="arrow" size="sm" /></button></footer>
    </div>
    <aside className={`live-context ${contextOpen ? "open" : ""}`}><header className="structure-head"><h2>Confirmed context</h2><button className="close-button" onClick={() => setContextOpen(false)}><Icon name="close" size="sm" /></button></header><div className="structure-stack">{fields.length ? fields.map((field, index) => <article className={`structure-card ${field.status}`} key={`${field.label}:${index}`}><header><span>{field.label}</span><span>{field.status}</span></header><p>{field.value}</p></article>) : <article className="structure-card open"><header><span>Transcript</span><span>Open</span></header><p>Confirmed decisions will appear here after NexMind structures the real transcript.</p></article>}</div></aside>
  </section>;
}
