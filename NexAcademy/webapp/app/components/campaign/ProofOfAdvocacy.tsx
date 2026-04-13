"use client";

import { useCallback, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AdvocacyPhase = "gate" | "compose" | "analyzing" | "verdict";

type SignalResult = {
  originality: number;
  contextRelevance: number;
  slopScore: number;
  verdict: "approved" | "rejected";
  reason: string;
};

export interface ProofOfAdvocacyProps {
  campaignId: number;
  campaignTitle: string;
  sponsorName: string;
  /** Called when user clicks Continue (after verdict or skip) */
  onComplete: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ProofOfAdvocacy({
  campaignId,
  campaignTitle,
  sponsorName,
  onComplete,
}: ProofOfAdvocacyProps) {
  const [phase, setPhase] = useState<AdvocacyPhase>("gate");
  const [xConnected, setXConnected] = useState(false);
  const [postText, setPostText] = useState("");
  const [result, setResult] = useState<SignalResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badgeEarned, setBadgeEarned] = useState(false);

  // ── Connect X Gate ──────────────────────────────────────────────────────
  const handleConnectX = useCallback(async () => {
    // In production: call Privy's linkSocial('twitter')
    // For now, simulate a successful connection
    setXConnected(true);
    setPhase("compose");
  }, []);

  // ── Mock Scenarios ──────────────────────────────────────────────────────
  const loadMock = useCallback(
    (scenario: "genuine" | "slop" | "spam") => {
      const mocks: Record<string, string> = {
        genuine: `Just finished the ${campaignTitle} course on @NexID_Academy. The deep dive into ${sponsorName}'s architecture changed how I think about protocol design. The sequencer model alone is worth studying. Genuine alpha for builders.`,
        slop: `This is revolutionary blockchain technology that will change the world forever. The innovative solutions provided by this amazing platform are truly groundbreaking. Everyone should use this incredible protocol. #web3 #blockchain #crypto #DeFi #amazing`,
        spam: `FREE AIRDROP! Claim your tokens now at totallylegit.xyz. 1000x guaranteed returns. Join discord for whitelist. RT + Follow for giveaway. NFA DYOR.`,
      };
      setPostText(mocks[scenario] ?? "");
    },
    [campaignTitle, sponsorName],
  );

  // ── Signal Analysis ─────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!postText.trim() || postText.trim().length < 20) {
      setError("Post must be at least 20 characters.");
      return;
    }

    setError(null);
    setAnalyzing(true);
    setPhase("analyzing");

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch(`/api/campaigns/${campaignId}/advocacy/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ postText: postText.trim() }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Analysis failed");
      }

      const signalResult: SignalResult = {
        originality: body.originality ?? 0,
        contextRelevance: body.contextRelevance ?? 0,
        slopScore: body.slopScore ?? 0,
        verdict: body.verdict ?? "rejected",
        reason: body.reason ?? "",
      };

      setResult(signalResult);
      setBadgeEarned(signalResult.verdict === "approved");
      setPhase("verdict");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPhase("compose");
    } finally {
      setAnalyzing(false);
    }
  }, [postText, campaignId]);

  // ── Meter Helper ────────────────────────────────────────────────────────
  function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
    const pct = Math.max(0, Math.min(100, Math.round(value)));
    return (
      <div className="adv-meter">
        <div className="adv-meter-lbl">
          <span>{label}</span>
          <span className="adv-meter-val" style={{ color: `var(--${tone})` }}>
            {pct}%
          </span>
        </div>
        <div className="adv-meter-bar">
          <div
            className="adv-meter-fill"
            style={{ width: `${pct}%`, background: `var(--${tone})` }}
          />
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="stage st-advocacy on">
      <div className="adv-header">
        <div className="ey ey-gold" style={{ marginBottom: 4 }}>
          Proof of Advocacy
        </div>
        <div style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: 20, color: "#fff" }}>
          Share Your Take
        </div>
        <div className="adv-note">
          Optional layer &middot; +0 pts &middot; Earns reputation badges only
        </div>
      </div>

      {/* ── Gate: Connect X ─────────────────────────────────────────── */}
      {phase === "gate" && !xConnected && (
        <div className="adv-connect-gate">
          <div style={{ fontSize: 40, marginBottom: 12 }}>𝕏</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#fff", marginBottom: 6 }}>
            Connect your X account
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 16, maxWidth: 340 }}>
            Your X handle is required to verify advocacy authenticity. This does not post on your behalf.
          </div>
          <button type="button" className="btn btn-gold" onClick={handleConnectX}>
            Connect X Account
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 10 }}
            onClick={onComplete}
          >
            Skip Advocacy
          </button>
        </div>
      )}

      {/* ── Compose ─────────────────────────────────────────────────── */}
      {phase === "compose" && (
        <div className="adv-main">
          <div className="adv-compose">
            <textarea
              className="adv-textarea"
              placeholder={`Write about your experience with ${sponsorName}. What did you learn? What stood out?`}
              value={postText}
              onChange={(e) => {
                setPostText(e.target.value);
                setError(null);
              }}
              maxLength={280}
              rows={4}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--t4)",
                marginTop: 4,
              }}
            >
              <span>{postText.length}/280</span>
              <span>Min 20 chars</span>
            </div>
          </div>

          <div className="adv-mock-row">
            <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--t4)" }}>
              Load mock:
            </span>
            <button type="button" className="adv-mock-btn" onClick={() => loadMock("genuine")}>
              Genuine
            </button>
            <button type="button" className="adv-mock-btn" onClick={() => loadMock("slop")}>
              AI Slop
            </button>
            <button type="button" className="adv-mock-btn" onClick={() => loadMock("spam")}>
              Spam
            </button>
          </div>

          {error && (
            <div style={{ fontSize: 11, color: "var(--red)", marginTop: 8 }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-gold"
              style={{ flex: 1 }}
              onClick={handleAnalyze}
              disabled={!postText.trim()}
            >
              Analyze Signal
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onComplete}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Analyzing ───────────────────────────────────────────────── */}
      {phase === "analyzing" && (
        <div className="adv-engine">
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>
            Signal Engine Processing
          </div>
          <Meter label="Originality" value={0} tone="green" />
          <Meter label="Context Relevance" value={0} tone="blue" />
          <Meter label="AI Slop Score" value={0} tone="red" />
          <div
            style={{
              marginTop: 16,
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--t3)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          >
            Analyzing post authenticity...
          </div>
        </div>
      )}

      {/* ── Verdict ─────────────────────────────────────────────────── */}
      {phase === "verdict" && result && (
        <div className="adv-engine">
          <Meter label="Originality" value={result.originality} tone="green" />
          <Meter label="Context Relevance" value={result.contextRelevance} tone="blue" />
          <Meter label="AI Slop Score" value={result.slopScore} tone="red" />

          <div
            className="adv-verdict"
            style={{
              borderColor:
                result.verdict === "approved"
                  ? "rgba(30,194,106,.25)"
                  : "rgba(240,72,72,.25)",
              background:
                result.verdict === "approved"
                  ? "rgba(30,194,106,.06)"
                  : "rgba(240,72,72,.06)",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color:
                  result.verdict === "approved" ? "var(--green)" : "var(--red)",
              }}
            >
              {result.verdict === "approved" ? "Signal Approved" : "Signal Rejected"}
            </div>
            <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 4 }}>
              {result.reason}
            </div>
          </div>

          {badgeEarned && (
            <div className="adv-badge-earned">
              <span style={{ fontSize: 24 }}>📣</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>
                  Protocol Advocate Badge Earned
                </div>
                <div style={{ fontSize: 11, color: "var(--t3)" }}>
                  Added to your identity layer
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn-gold"
            style={{ marginTop: 16, width: "100%" }}
            onClick={onComplete}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
