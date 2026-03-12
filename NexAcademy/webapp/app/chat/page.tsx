"use client";

import { Layout } from "@/components/Layout";

export default function ChatAgent() {
    return (
        <Layout>
            <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-0 py-16">
                <section className="rounded-[30px] bg-white border border-black/5 shadow-[0_24px_70px_rgba(15,23,42,0.16)] p-6 flex flex-col gap-4">
                    <header className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-[#fef3c7] flex items-center justify-center text-xl">
                            🤖
                        </div>
                        <div>
                            <h1 className="text-sm font-semibold text-[#111]">Nex Tutor Agent</h1>
                            <p className="text-[11px] text-[#777]">Ask questions as you learn.</p>
                        </div>
                    </header>

                    <div className="flex-1 min-h-[320px] rounded-2xl bg-[#f8fafc] border border-black/5 p-4 flex flex-col">
                        {/* Chat messages area */}
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <div className="w-16 h-16 rounded-full bg-[#fef3c7] flex items-center justify-center text-3xl mx-auto mb-4">
                                    🤖
                                </div>
                                <p className="text-sm text-[#555] mb-2">Welcome to Nex Tutor!</p>
                                <p className="text-xs text-[#777] max-w-sm">
                                    I'm here to help you learn. Ask me anything about the courses, Web3 concepts,
                                    or your current lessons.
                                </p>
                            </div>
                        </div>

                        {/* Sample suggested questions */}
                        <div className="mt-4 flex flex-wrap gap-2 justify-center">
                            {[
                                "Explain smart contracts",
                                "What is a wallet?",
                                "How do lesson activities work?",
                            ].map((q) => (
                                <button
                                    key={q}
                                    className="px-3 py-1.5 text-[11px] rounded-full bg-white border border-black/10 text-[#555] hover:bg-[#fff7dd] transition"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            // Chat functionality would be implemented here
                        }}
                        className="flex items-center gap-3 mt-2"
                    >
                        <input
                            type="text"
                            placeholder="Ask a question about your current lesson…"
                            className="flex-1 px-4 py-3 rounded-full border border-black/10 bg-white text-sm outline-none focus:ring-2 focus:ring-[#facc15] transition"
                        />
                        <button
                            type="submit"
                            className="px-5 py-3 rounded-full bg-[#111] text-white text-sm font-semibold hover:bg-[#222] transition"
                        >
                            Send
                        </button>
                    </form>

                    <p className="text-[10px] text-[#999] text-center">
                        Nex Tutor is powered by AI. Responses are for educational purposes only.
                    </p>
                </section>
            </main>
        </Layout>
    );
}
