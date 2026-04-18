"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AdvocacyPhase = "gate" | "compose" | "submitting" | "submitted";

export interface ProofOfAdvocacyProps {
  campaignId: number;
  campaignTitle: string;
  sponsorName: string;
  /** Called when user clicks Continue (after submission or skip) */
  onComplete: () => void;
}

type TwitterLinkedAccount = {
  type: "twitter_oauth";
  username?: string | null;
  name?: string | null;
};

const TWEET_URL_REGEX =
  /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/i;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ProofOfAdvocacy({
  campaignId,
  campaignTitle,
  sponsorName,
  onComplete,
}: ProofOfAdvocacyProps) {
  const { user, ready, authenticated } = usePrivy();
  const { linkTwitter } = useLinkAccount();
  const router = useRouter();

  const twitterAccount = user?.linkedAccounts?.find(
    (account): account is TwitterLinkedAccount => account.type === "twitter_oauth",
  );
  const twitterLinked = Boolean(twitterAccount);
  const linkedHandle = twitterAccount?.username?.replace(/^@/, "") ?? null;

  const [phase, setPhase] = useState<AdvocacyPhase>(twitterLinked ? "compose" : "gate");
  const [tweetUrl, setTweetUrl] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (ready && twitterLinked && phase === "gate") {
      setPhase("compose");
      setLinking(false);
    }
  }, [ready, twitterLinked, phase]);

  // ── Connect X Gate ──────────────────────────────────────────────────────
  const handleConnectX = useCallback(async () => {
    setError(null);
    if (ready && !authenticated) {
      setError("Session expired. Please reconnect from the gateway.");
      setTimeout(() => router.push("/academy-gateway"), 1200);
      return;
    }

    setLinking(true);
    try {
      await linkTwitter();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect X");
      setLinking(false);
    }
  }, [ready, authenticated, linkTwitter, router]);

  // ── Sample guides (read-only inspiration, user writes in their own voice) ─
  const guides = useMemo(
    () => [
      {
        label: "Genuine",
        tone: "green" as const,
        text: `Just finished the ${campaignTitle} course on @NexID_Academy. The deep dive into ${sponsorName}'s architecture changed how I think about protocol design. The sequencer model alone is worth studying. Genuine alpha for builders.`,
      },
      {
        label: "AI Slop",
        tone: "red" as const,
        text: `This is revolutionary blockchain technology that will change the world forever. The innovative solutions provided by this amazing platform are truly groundbreaking. Everyone should use this incredible protocol. #web3 #blockchain #crypto #DeFi #amazing`,
      },
      {
        label: "Spam",
        tone: "red" as const,
        text: `FREE AIRDROP! Claim your tokens now at totallylegit.xyz. 1000x guaranteed returns. Join discord for whitelist. RT + Follow for giveaway. NFA DYOR.`,
      },
    ],
    [campaignTitle, sponsorName],
  );

  // ── Submit tweet URL ────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const trimmed = tweetUrl.trim();
    const match = TWEET_URL_REGEX.exec(trimmed);
    if (!match) {
      setError("Paste a valid tweet URL, e.g. https://x.com/yourhandle/status/1234567890");
      return;
    }
    const urlHandle = match[1];
    if (linkedHandle && urlHandle.toLowerCase() !== linkedHandle.toLowerCase()) {
      setError(
        `This tweet is from @${urlHandle}, but your connected X account is @${linkedHandle}. Paste the link to your own tweet.`,
      );
      return;
    }

    setError(null);
    setPhase("submitting");

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch(`/api/campaigns/${campaignId}/advocacy/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tweetUrl: trimmed, expectedHandle: linkedHandle }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Submission failed");
      }

      setSubmittedUrl(trimmed);
      setPhase("submitted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setPhase("compose");
    }
  }, [tweetUrl, linkedHandle, campaignId]);

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
      {phase === "gate" && (
        <div className="adv-connect-gate">
          <div style={{ fontSize: 40, marginBottom: 12 }}>𝕏</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#fff", marginBottom: 6 }}>
            Connect your X account
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 16, maxWidth: 340 }}>
            Your X handle is required to verify advocacy authenticity. This does not post on your behalf.
          </div>
          {error && (
            <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 12 }}>{error}</div>
          )}
          <button
            type="button"
            className="btn btn-gold"
            onClick={handleConnectX}
            disabled={linking || !ready}
          >
            {linking ? "Opening X..." : "Connect X Account"}
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
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 12,
                color: "var(--t2)",
                marginBottom: 6,
                lineHeight: 1.5,
              }}
            >
              Post your take on X, then paste the link to your tweet below.
              {linkedHandle && (
                <>
                  {" "}Posting as{" "}
                  <span style={{ color: "var(--gold)", fontWeight: 600 }}>
                    @{linkedHandle}
                  </span>
                  .
                </>
              )}
            </div>
            <input
              type="url"
              className="adv-textarea"
              style={{ minHeight: 0, height: 44, padding: "0 12px" }}
              placeholder={
                linkedHandle
                  ? `https://x.com/${linkedHandle}/status/...`
                  : "https://x.com/yourhandle/status/..."
              }
              value={tweetUrl}
              onChange={(e) => {
                setTweetUrl(e.target.value);
                setError(null);
              }}
              inputMode="url"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--t4)",
              marginBottom: 6,
            }}
          >
            Sample guides (for inspiration only — write your tweet in your own words on X):
          </div>
          <div className="adv-guides">
            {guides.map((g) => (
              <div key={g.label} className="adv-guide-card">
                <div className="adv-guide-label" style={{ color: `var(--${g.tone})` }}>
                  {g.label}
                </div>
                <div className="adv-guide-text">{g.text}</div>
              </div>
            ))}
          </div>

          {error && (
            <div style={{ fontSize: 11, color: "var(--red)", marginTop: 8 }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-gold"
              style={{ flex: 1 }}
              onClick={handleSubmit}
              disabled={!tweetUrl.trim()}
            >
              Submit Tweet Link
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

      {/* ── Submitting ──────────────────────────────────────────────── */}
      {phase === "submitting" && (
        <div className="adv-engine">
          <div
            style={{
              fontSize: 13,
              fontFamily: "var(--mono)",
              color: "var(--t3)",
              animation: "pulse 1.5s ease-in-out infinite",
              textAlign: "center",
              padding: "24px 0",
            }}
          >
            Saving your tweet link...
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: "100%" }}
            onClick={onComplete}
          >
            Skip
          </button>
        </div>
      )}

      {/* ── Submitted ───────────────────────────────────────────────── */}
      {phase === "submitted" && submittedUrl && (
        <div className="adv-engine">
          <div
            className="adv-verdict"
            style={{
              borderColor: "rgba(30,194,106,.25)",
              background: "rgba(30,194,106,.06)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--green)" }}>
              Submission Received
            </div>
            <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 4, lineHeight: 1.5 }}>
              Your tweet link is saved. Our signal scanner will review it and
              award the Protocol Advocate badge if your post qualifies. You can
              move on — this module is optional.
            </div>
            <a
              href={submittedUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginTop: 8,
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--gold)",
                wordBreak: "break-all",
              }}
            >
              {submittedUrl}
            </a>
          </div>

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
