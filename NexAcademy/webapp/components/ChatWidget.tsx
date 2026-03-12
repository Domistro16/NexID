"use client";

import React from "react";

export const ChatWidget: React.FC = () => {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 px-4 py-3 rounded-full bg-[#111] text-white text-sm font-semibold shadow-[0_18px_55px_rgba(15,23,42,0.40)] flex items-center gap-2 hover:translate-y-[-2px] hover:shadow-[0_26px_75px_rgba(15,23,42,0.55)] transition-all"
      >
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#ffe1a3] via-[#ffd873] to-[#fff0b3] flex items-center justify-center">
          💬
        </span>
        <span>Ask as you learn</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_30px_90px_rgba(15,23,42,0.55)] border border-black/5 p-4 sm:p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ffe1a3] via-[#ffd873] to-[#fff0b3] flex items-center justify-center">
                  🤖
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#111]">Nex Tutor Agent</div>
                  <div className="text-[11px] text-[#777]">Ask questions as you learn</div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full bg-[#f5f5f5] flex items-center justify-center text-xs text-[#555]"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-[160px] max-h-[260px] rounded-2xl bg-[#fff9ea] border border-black/5 p-3 text-[13px] text-[#555] overflow-y-auto">
              <p>
                This is a UI stub for the Nex Tutor Agent. Plug your chatbot backend here to
                stream answers, hints, and explanations while learners move through lessons.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-full border border-black/10 bg-[#fafafa] px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#f4b000]"
                placeholder="Type a question about this lesson..."
              />
              <button className="px-4 py-2 rounded-full bg-[#111] text-white text-[12px] font-semibold">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatWidget;
