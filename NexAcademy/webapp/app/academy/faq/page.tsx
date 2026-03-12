"use client";

import { useState } from "react";
import { FAQS } from "../_data";

export default function AcademyFaqPage() {
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggleItem = (idx: number) => {
    setOpenItems((prev) => (prev.includes(idx) ? prev.filter((item) => item !== idx) : [...prev, idx]));
  };

  return (
    <section className="mx-auto w-full max-w-[900px] px-6 pb-12 pt-16">
      <div className="text-center mb-12">
        <div className="text-[10px] font-mono text-nexid-gold border border-nexid-gold/30 bg-nexid-gold/10 px-2.5 py-1 rounded inline-flex mb-4 uppercase tracking-widest">
          Knowledge Base
        </div>
        <h1 className="font-display text-4xl font-bold text-white mb-4">Protocol FAQ</h1>
        <p className="text-nexid-muted">Architecture, verifications, and prize pools explained.</p>
      </div>
      <div className="space-y-4">
        {FAQS.map((item, idx) => {
          const open = openItems.includes(idx);
          return (
            <div
              key={item.q}
              className={`faq-item premium-panel cursor-pointer overflow-hidden bg-[#0a0a0a] ${open ? "active" : ""}`}
              onClick={() => toggleItem(idx)}
            >
              <div className="flex items-center justify-between p-6">
                <h3 className="font-medium text-white">{item.q}</h3>
                <svg
                  className="w-5 h-5 text-nexid-muted faq-icon shrink-0 ml-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="faq-content border-t border-[#1a1a1a] bg-[#050505]">
                <div className="p-6 text-sm leading-relaxed text-nexid-muted">{item.a}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
