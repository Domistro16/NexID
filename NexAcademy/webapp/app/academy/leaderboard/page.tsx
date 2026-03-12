"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useENSName } from "@/hooks/getPrimaryName";

type LeaderboardRow = {
    rank: number;
    walletAddress: string;
    totalPoints: number;
    campaignsFinished: number;
    totalScore: number;
};

function authHeaders(): Record<string, string> {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function shortAddr(addr: string) {
    if (addr.length < 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function GlobalLeaderboardPage() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"24h" | "7d" | "all">("all");
    const [authWalletAddress, setAuthWalletAddress] = useState<string | null>(null);
    const hasToken = typeof window !== "undefined" && !!localStorage.getItem("auth_token");
    const { address } = useAccount();
    const identityAddress = authWalletAddress ?? address ?? null;
    const { name: domainName } = useENSName({ owner: (identityAddress || "0x0000000000000000000000000000000000000000") as `0x${string}` });

    const displayName =
        domainName && typeof domainName === "string" && domainName.length > 0
            ? domainName
            : identityAddress
                ? shortAddr(identityAddress)
                : null;

    useEffect(() => {
        if (!hasToken) {
            setAuthWalletAddress(null);
            return;
        }
        fetch("/api/user/profile", { headers: authHeaders() })
            .then(async (res) => {
                if (!res.ok) return;
                const body = await res.json();
                const walletAddress = typeof body?.user?.walletAddress === "string"
                    ? body.user.walletAddress
                    : null;
                setAuthWalletAddress(walletAddress);
            })
            .catch(() => setAuthWalletAddress(null));
    }, [hasToken]);

    useEffect(() => {
        fetch("/api/leaderboard", { cache: "no-store" })
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data.leaderboard)) setLeaderboard(data.leaderboard);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const top3 = leaderboard.slice(0, 3);
    const rest = leaderboard.slice(3);

    // Find the user's row
    const userRow = identityAddress
        ? leaderboard.find((r) => r.walletAddress.toLowerCase() === identityAddress.toLowerCase())
        : null;

    const tabs: { key: "24h" | "7d" | "all"; label: string }[] = [
        { key: "24h", label: "24H" },
        { key: "7d", label: "7D" },
        { key: "all", label: "ALL-TIME" },
    ];

    return (
        <section className="mx-auto w-full max-w-[1200px] px-6 pb-12 pt-12 lg:px-12">
            {/* SVG gradient defs for gems */}
            <svg style={{ width: 0, height: 0, position: "absolute" }} aria-hidden="true">
                <defs>
                    <linearGradient id="goldTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFF2CD" /><stop offset="100%" stopColor="#FFD700" /></linearGradient>
                    <linearGradient id="goldLeft" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#FFD700" /><stop offset="100%" stopColor="#D4AF37" /></linearGradient>
                    <linearGradient id="goldRight" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#DAA520" /><stop offset="100%" stopColor="#996515" /></linearGradient>
                    <linearGradient id="silverTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFFFFF" /><stop offset="100%" stopColor="#E0E0E0" /></linearGradient>
                    <linearGradient id="silverLeft" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#E0E0E0" /><stop offset="100%" stopColor="#A9A9A9" /></linearGradient>
                    <linearGradient id="silverRight" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B0C4DE" /><stop offset="100%" stopColor="#696969" /></linearGradient>
                    <linearGradient id="bronzeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFDAB9" /><stop offset="100%" stopColor="#CD7F32" /></linearGradient>
                    <linearGradient id="bronzeLeft" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#CD7F32" /><stop offset="100%" stopColor="#A0522D" /></linearGradient>
                    <linearGradient id="bronzeRight" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A0522D" /><stop offset="100%" stopColor="#5C3317" /></linearGradient>
                </defs>
            </svg>

            {/* Header */}
            <div className="text-center mb-16">
                <div className="text-[10px] font-mono text-nexid-gold border border-nexid-gold/30 bg-nexid-gold/10 px-2.5 py-1 rounded inline-flex mb-4 uppercase tracking-widest">Protocol Ledger</div>
                <h1 className="font-display text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">Global Hierarchy</h1>
                <p className="text-nexid-muted max-w-2xl mx-auto">
                    Accumulate Nex Points by completing academy modules and verifying ecosystem tasks. Top ranks are heavily weighted for future airdrops.
                </p>

                {/* Time Tabs */}
                <div className="flex justify-center mt-8">
                    <div className="flex bg-[#0a0a0a] rounded-lg p-1.5 border border-[#222] text-xs font-mono shadow-inner-glaze">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-6 py-2 rounded-md transition-colors ${activeTab === tab.key ? "bg-[#222] text-white" : "text-nexid-muted hover:text-white"}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center text-sm text-nexid-muted">Loading leaderboard...</div>
            ) : leaderboard.length === 0 ? (
                <div className="text-center text-sm text-nexid-muted">No leaderboard entries yet.</div>
            ) : (
                <>
                    {/* Podium */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 max-w-4xl mx-auto items-end md:h-72">
                        {/* Silver — Rank 2 */}
                        {top3[1] ? (
                            <div className="podium-card premium-panel rank-2-gradient flex flex-col items-center justify-center p-8 text-center relative overflow-hidden group h-[240px]">
                                <svg viewBox="0 0 100 100" className="w-20 h-20 mb-4 drop-shadow-[0_0_15px_rgba(192,192,192,0.4)] z-10 relative group-hover:scale-110 transition-transform duration-500">
                                    <polygon points="50,5 90,28 50,50 10,28" fill="url(#silverTop)" />
                                    <polygon points="10,28 50,50 50,95 10,72" fill="url(#silverLeft)" />
                                    <polygon points="90,28 90,72 50,95 50,50" fill="url(#silverRight)" />
                                    <polyline points="50,5 90,28 90,72 50,95 10,72 10,28 50,5" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.6" />
                                    <polyline points="10,28 50,50 90,28" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.5" />
                                    <line x1="50" y1="50" x2="50" y2="95" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.5" />
                                    <polygon points="50,12 78,28 50,42 22,28" fill="#FFFFFF" opacity="0.4" />
                                </svg>
                                <div className="text-[10px] font-mono text-[#C0C0C0] mb-1 tracking-widest uppercase">Rank 02</div>
                                <div className="font-display text-2xl text-white mb-1 relative z-10">{shortAddr(top3[1].walletAddress)}</div>
                                <div className="font-mono text-sm opacity-80 relative z-10">{top3[1].totalPoints.toLocaleString()} pts</div>
                            </div>
                        ) : <div />}

                        {/* Gold — Rank 1 */}
                        {top3[0] ? (
                            <div className="podium-card premium-panel rank-1-gradient flex flex-col items-center justify-center p-10 text-center relative overflow-hidden group shadow-[0_10px_40px_rgba(255,215,0,0.15)] z-10 h-[280px]">
                                <svg viewBox="0 0 100 100" className="w-24 h-24 mb-4 drop-shadow-[0_0_25px_rgba(255,215,0,0.6)] z-10 relative group-hover:scale-110 transition-transform duration-500">
                                    <polygon points="50,5 90,28 50,50 10,28" fill="url(#goldTop)" />
                                    <polygon points="10,28 50,50 50,95 10,72" fill="url(#goldLeft)" />
                                    <polygon points="90,28 90,72 50,95 50,50" fill="url(#goldRight)" />
                                    <polyline points="50,5 90,28 90,72 50,95 10,72 10,28 50,5" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.6" />
                                    <polyline points="10,28 50,50 90,28" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.5" />
                                    <line x1="50" y1="50" x2="50" y2="95" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.5" />
                                    <polygon points="50,12 78,28 50,42 22,28" fill="#FFFFFF" opacity="0.4" />
                                </svg>
                                <div className="text-[10px] font-mono text-[#FFD700] mb-1 tracking-widest uppercase">Rank 01</div>
                                <div className="font-display text-3xl text-white mb-1 relative z-10">{shortAddr(top3[0].walletAddress)}</div>
                                <div className="font-mono text-sm opacity-80 relative z-10 font-bold">{top3[0].totalPoints.toLocaleString()} pts</div>
                            </div>
                        ) : <div />}

                        {/* Bronze — Rank 3 */}
                        {top3[2] ? (
                            <div className="podium-card premium-panel rank-3-gradient flex flex-col items-center justify-center p-8 text-center relative overflow-hidden group h-[220px]">
                                <svg viewBox="0 0 100 100" className="w-16 h-16 mb-4 drop-shadow-[0_0_15px_rgba(205,127,50,0.5)] z-10 relative group-hover:scale-110 transition-transform duration-500">
                                    <polygon points="50,5 90,28 50,50 10,28" fill="url(#bronzeTop)" />
                                    <polygon points="10,28 50,50 50,95 10,72" fill="url(#bronzeLeft)" />
                                    <polygon points="90,28 90,72 50,95 50,50" fill="url(#bronzeRight)" />
                                    <polyline points="50,5 90,28 90,72 50,95 10,72 10,28 50,5" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.6" />
                                    <polyline points="10,28 50,50 90,28" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.5" />
                                    <line x1="50" y1="50" x2="50" y2="95" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.5" />
                                    <polygon points="50,12 78,28 50,42 22,28" fill="#FFFFFF" opacity="0.3" />
                                </svg>
                                <div className="text-[10px] font-mono text-[#CD7F32] mb-1 tracking-widest uppercase">Rank 03</div>
                                <div className="font-display text-xl text-white mb-1 relative z-10">{shortAddr(top3[2].walletAddress)}</div>
                                <div className="font-mono text-sm opacity-80 relative z-10">{top3[2].totalPoints.toLocaleString()} pts</div>
                            </div>
                        ) : <div />}
                    </div>

                    {/* Leaderboard Table */}
                    <div className="premium-panel bg-[#0a0a0a] overflow-hidden max-w-4xl mx-auto border-[#1a1a1a]">
                        {/* YOU row */}
                        {userRow ? (
                            <div className="bg-[#111]/90 backdrop-blur-md border-b border-nexid-gold/30 p-4 flex items-center justify-between sticky top-0 z-10 shadow-[0_4px_20px_-5px_rgba(255,176,0,0.15)]">
                                <div className="flex items-center gap-6">
                                    <div className="w-8 text-center font-mono text-lg text-nexid-gold font-bold">{userRow.rank}</div>
                                    <div className="font-medium text-white flex items-center gap-3">
                                        {displayName || shortAddr(userRow.walletAddress)}
                                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-nexid-muted font-mono uppercase tracking-widest border border-white/5">YOU</span>
                                    </div>
                                </div>
                                <div className="font-mono text-base text-nexid-gold font-bold">{userRow.totalPoints.toLocaleString()} pts</div>
                            </div>
                        ) : displayName ? (
                            <div className="bg-[#111]/90 backdrop-blur-md border-b border-nexid-gold/30 p-4 flex items-center justify-between sticky top-0 z-10 shadow-[0_4px_20px_-5px_rgba(255,176,0,0.15)]">
                                <div className="flex items-center gap-6">
                                    <div className="w-8 text-center font-mono text-lg text-nexid-gold font-bold">—</div>
                                    <div className="font-medium text-white flex items-center gap-3">
                                        {displayName}
                                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-nexid-muted font-mono uppercase tracking-widest border border-white/5">YOU</span>
                                    </div>
                                </div>
                                <div className="font-mono text-base text-nexid-muted">0 pts</div>
                            </div>
                        ) : null}

                        {/* Rows */}
                        <div className="p-2">
                            {rest.map((row) => (
                                <div key={`${row.walletAddress}-${row.rank}`} className="p-3 border-b border-[#1a1a1a] flex items-center justify-between hover:bg-[#111] transition-colors last:border-0 rounded">
                                    <div className="flex items-center gap-6">
                                        <div className="w-8 text-center font-mono text-sm text-nexid-muted">{row.rank}</div>
                                        <div className="font-medium text-white/90">{shortAddr(row.walletAddress)}</div>
                                    </div>
                                    <div className="font-mono text-sm text-nexid-muted">{row.totalPoints.toLocaleString()} pts</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}
