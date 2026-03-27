"use client";

import { useState } from "react";

export default function SettingsView() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="relative">
      <div className="mb-4">
        <div className="text-[9px] font-mono font-medium tracking-widest uppercase text-nexid-gold/60 mb-1.5">System</div>
        <div className="font-display font-bold text-lg text-white tracking-tight">Admin Settings</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* API Keys */}
        <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4">
          <div className="text-[9px] font-mono uppercase text-neutral-500 mb-3">API Keys</div>
          <SettingsField label="Synthesia API Key" type="password" defaultValue="sk-synth-************************" />
          <SettingsField label="ElevenLabs API Key (Agent Voice)" type="password" defaultValue="el-************************" />
          <SettingsField label="OpenAI API Key (Semantic Grading)" type="password" defaultValue="sk-openai-************************" />
          <SettingsField label="Anthropic API Key (Preferred)" type="password" defaultValue="sk-ant-************************" />
          <SettingsField label="Default RPC (Solana)" defaultValue="https://mainnet.helius-rpc.com/?api-key=..." />
          <button
            onClick={() => showToast("API keys saved")}
            className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors"
          >
            Save Keys
          </button>
        </div>

        {/* Platform Config */}
        <div className="bg-[#060606] border border-white/[.06] rounded-xl p-4">
          <div className="text-[9px] font-mono uppercase text-neutral-500 mb-3">Platform Config</div>
          <SettingsField label="Default Quiz Pass Threshold" type="number" defaultValue="88" />
          <SettingsField label="Speed Trap Response Window (seconds)" type="number" defaultValue="10" />
          <SettingsField label="Session Inactive Timeout (seconds)" type="number" defaultValue="5" />
          <SettingsField label="Bot Shadow Ban Threshold (strikes)" type="number" defaultValue="2" />
          <SettingsField label="AI Signature Detection Threshold (%)" type="number" defaultValue="35" />
          <button
            onClick={() => showToast("Config saved")}
            className="text-[11px] font-display font-bold px-4 py-2 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors"
          >
            Save Config
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-5 right-5 bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-2.5 text-[12px] text-white z-50 shadow-2xl">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

function SettingsField({ label, defaultValue, type = "text" }: { label: string; defaultValue: string; type?: string }) {
  return (
    <div className="mb-3">
      <label className="block text-[9px] font-mono uppercase text-neutral-500 tracking-wider mb-1">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        className="w-full bg-[#0a0a0a] border border-white/[.06] rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-nexid-gold/40"
      />
    </div>
  );
}
