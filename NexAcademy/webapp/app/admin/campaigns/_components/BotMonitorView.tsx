"use client";

import { useEffect, useRef, useState } from "react";

interface LogEntry {
  id: number;
  timestamp: string;
  type: "red" | "green" | "gold" | "blue";
  message: string;
}

const LOG_EVENTS = [
  { type: "red" as const, msg: "Shadow-banned: 0x3f...a9b — session inactive (12s)" },
  { type: "red" as const, msg: "Shadow-banned: 0x7e...2c1 — speed trap fail (2/2)" },
  { type: "gold" as const, msg: "Sybil cluster detected: 8 wallets, same IP range" },
  { type: "red" as const, msg: "AI-sig flag: answer matched GPT-4 pattern (94% confidence)" },
  { type: "green" as const, msg: "Verified: builder.id — Layer 3 on-chain confirmed" },
  { type: "blue" as const, msg: "Agent session started: whale99.id — rank #4" },
  { type: "red" as const, msg: "Shadow-banned: 0x9c...11d — behavioural score 0.04" },
  { type: "green" as const, msg: "Campaign milestone: 2,000 verified participants" },
  { type: "red" as const, msg: "Shadow-banned: 0xa1...4d7 — heartbeat anomaly detected" },
  { type: "gold" as const, msg: "AI content detected: 0x55...8ef — confidence 0.91" },
  { type: "blue" as const, msg: "Quiz attempt: alpha.id — score 94/100" },
  { type: "green" as const, msg: "On-chain verification: nexiq.id — swap confirmed" },
];

const typeColorMap: Record<string, string> = {
  red: "text-red-400",
  green: "text-green-400",
  gold: "text-nexid-gold",
  blue: "text-blue-400",
};

export default function BotMonitorView() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const counterRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const ev = LOG_EVENTS[Math.floor(Math.random() * LOG_EVENTS.length)];
      const ts = new Date().toTimeString().slice(0, 8);
      counterRef.current += 1;
      setEntries((prev) => [
        { id: counterRef.current, timestamp: ts, type: ev.type, message: ev.msg },
        ...prev.slice(0, 49),
      ]);
    }, 1400);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div>
      <div className="mb-4">
        <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-1.5">Live Intelligence</div>
        <div className="font-display font-bold text-lg text-white tracking-tight">Bot Monitor</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Live log */}
        <div className="bg-[#060606] border border-white/[.06] rounded-xl p-3.5">
          <div className="text-[9px] font-mono uppercase text-neutral-500 mb-2.5">Live Detection Log</div>
          <div className="h-72 overflow-y-auto font-mono">
            {entries.length === 0 ? (
              <div className="text-[10px] text-neutral-600 text-center py-8">Waiting for events...</div>
            ) : (
              entries.map((e) => (
                <div key={e.id} className="flex gap-2 text-[10px] leading-relaxed py-0.5 border-b border-white/[.03]">
                  <span className="text-neutral-600 shrink-0">{e.timestamp}</span>
                  <span className={typeColorMap[e.type]}>■</span>
                  <span className="text-neutral-400">{e.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-3">
          <div className="bg-[#060606] border border-white/[.06] rounded-xl p-3.5">
            <div className="text-[9px] font-mono uppercase text-neutral-500 mb-2">Active Campaign · Detection Rate</div>
            <div className="font-display font-extrabold text-3xl text-red-400 tracking-tighter">23%</div>
            <div className="text-[9px] font-mono uppercase text-neutral-500 mt-0.5">738 bots shadow-banned · 3,210 total</div>
          </div>

          <div className="bg-[#060606] border border-white/[.06] rounded-xl p-3.5">
            <div className="text-[9px] font-mono uppercase text-neutral-500 mb-2">Shadow Ban Queue</div>
            <div className="text-[11px] font-mono text-neutral-300 space-y-1">
              {[
                { label: "Session inactive", count: "418", color: "text-red-400" },
                { label: "Speed trap fails", count: "209", color: "text-red-400" },
                { label: "Sybil clusters", count: "48 clusters", color: "text-red-400" },
                { label: "AI quiz flag", count: "214", color: "text-red-400" },
              ].map((r) => (
                <div key={r.label} className="flex justify-between">
                  <span className="text-neutral-500">{r.label}</span>
                  <span className={r.color}>{r.count}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-white/[.06] pt-1 mt-1">
                <span>Total excluded</span>
                <span className="font-medium text-red-400">738</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
