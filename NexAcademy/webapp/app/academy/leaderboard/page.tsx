"use client";

import { useMemo, useState } from "react";
import { badgeGlyph, shortAddr, useAcademyAccountSnapshot } from "../_components/account-data";

type LeaderboardTab = "all" | "7d" | "24h" | "camp";

function identityParts(displayName: string | null | undefined) {
  const value = (displayName ?? "founder").trim();
  const dotIndex = value.indexOf(".");
  if (dotIndex > 0) {
    return {
      base: value.slice(0, dotIndex),
      suffix: value.slice(dotIndex),
    };
  }

  return {
    base: value,
    suffix: "",
  };
}

function rowDisplayName(displayName: string | null | undefined, walletAddress: string) {
  const normalizedDisplayName =
    typeof displayName === "string" && displayName.trim().length > 0
      ? displayName.trim()
      : null;

  return normalizedDisplayName ?? shortAddr(walletAddress);
}

export default function GlobalLeaderboardPage() {
  const snapshot = useAcademyAccountSnapshot();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("all");
  const youName = identityParts(snapshot.displayName);

  const rows = useMemo(() => {
    const base = [...snapshot.leaderboard];
    if (activeTab === "7d") {
      return base.sort((a, b) => b.totalScore - a.totalScore || b.totalPoints - a.totalPoints);
    }
    if (activeTab === "24h") {
      return base.sort((a, b) => b.campaignsFinished - a.campaignsFinished || b.totalScore - a.totalScore);
    }
    if (activeTab === "camp") {
      return base.slice(0, 25);
    }
    return base;
  }, [activeTab, snapshot.leaderboard]);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const userRow = snapshot.identityAddress
    ? rows.find((row) => row.walletAddress.toLowerCase() === snapshot.identityAddress?.toLowerCase()) ?? null
    : null;

  return (
    <section>
      <div style={{ marginBottom: 18 }}>
        <div className="ey ey-gold" style={{ marginBottom: 8 }}>Rankings</div>
        <h1 style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: "clamp(1.4rem,3vw,2rem)", letterSpacing: "-.045em", color: "#fff" }}>
          Global Leaderboard
        </h1>
      </div>

      <div className="lb-tabs">
        {[
          { key: "all", label: "All Time" },
          { key: "7d", label: "7 Days" },
          { key: "24h", label: "24 Hours" },
          { key: "camp", label: "Active Campaign" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`lb-tab ${activeTab === tab.key ? "on" : ""}`}
            onClick={() => setActiveTab(tab.key as LeaderboardTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {snapshot.loading && rows.length === 0 ? (
        <div className="panel" style={{ padding: 18, color: "var(--t3)" }}>Loading leaderboard...</div>
      ) : (
        <>
          <div className="podium">
            {top3[1] ? (
              <div className="p-slot">
                <div className="p-card p2c">
                  <div className="p-rank p2r">2nd</div>
                  <div className="p-name">{rowDisplayName(top3[1].displayName, top3[1].walletAddress)}</div>
                  <div className="p-pts p2p">{top3[1].totalPoints.toLocaleString()}</div>
                </div>
              </div>
            ) : null}
            {top3[0] ? (
              <div className="p-slot">
                <div className="p-card p1c">
                  <div className="p-rank p1r">1st</div>
                  <div className="p-name">{rowDisplayName(top3[0].displayName, top3[0].walletAddress)}</div>
                  <div className="p-pts p1p">{top3[0].totalPoints.toLocaleString()}</div>
                </div>
              </div>
            ) : null}
            {top3[2] ? (
              <div className="p-slot">
                <div className="p-card p3c">
                  <div className="p-rank p3r">3rd</div>
                  <div className="p-name">{rowDisplayName(top3[2].displayName, top3[2].walletAddress)}</div>
                  <div className="p-pts p3p">{top3[2].totalPoints.toLocaleString()}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel" style={{ overflow: "hidden" }}>
            <div className="lb-table-head">
              <div className="ey">#</div>
              <div className="ey">Identity</div>
              <div className="ey">Badges</div>
              <div className="ey" style={{ textAlign: "right" }}>Score</div>
              <div className="ey" style={{ textAlign: "right" }}>Mult.</div>
            </div>
            <div style={{ maxHeight: 440, overflowY: "auto" }}>
              {rest.map((row) => {
                const isYou = !!snapshot.identityAddress && row.walletAddress.toLowerCase() === snapshot.identityAddress.toLowerCase();
                return (
                  <div key={`${row.walletAddress}-${row.rank}`} className={`lb-row ${isYou ? "you" : ""}`}>
                    <div className="lb-rank-num">{row.rank}</div>
                    <div className="lb-identity">
                      {isYou
                        ? (snapshot.displayName ?? rowDisplayName(row.displayName, row.walletAddress))
                        : rowDisplayName(row.displayName, row.walletAddress)}
                      {isYou ? <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--gold)", background: "var(--gold-d)", padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>you</span> : null}
                    </div>
                    <div className="lb-badges">{row.badgeDisplayText ?? "*"}</div>
                    <div className="lb-score" style={isYou ? { color: "var(--gold)" } : undefined}>{row.totalPoints.toLocaleString()}</div>
                    <div className="lb-mult">{(row.multiplierTotal ?? 1).toFixed(2)}x</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lb-you-box">
            <div className="ey" style={{ marginBottom: 8 }}>Your Position</div>
            <div className="lb-row you" style={{ borderRadius: "var(--r8)", padding: "9px 11px", border: "1px solid rgba(255,176,0,.12)" }}>
              <div className="lb-rank-num" style={{ color: "var(--gold)" }}>{userRow ? `#${userRow.rank}` : "-"}</div>
              <div className="lb-identity">
                <div className="lb-av">{(snapshot.displayName ?? "N").slice(0, 1).toUpperCase()}</div>
                {youName.base}
                {youName.suffix ? <span style={{ color: "var(--gold)" }}>{youName.suffix}</span> : null}
                <span className="ey" style={{ marginLeft: 4, color: "var(--gold)" }}>(you)</span>
              </div>
              <div className="lb-badges">{badgeRowForDisplay(snapshot)}</div>
              <div className="lb-score" style={{ color: "var(--gold)" }}>{(userRow?.totalPoints ?? snapshot.totalPoints).toLocaleString()}</div>
              <div className="lb-mult">{snapshot.multiplierTotal.toFixed(2)}x</div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function badgeRowForDisplay(snapshot: ReturnType<typeof useAcademyAccountSnapshot>) {
  if (snapshot.displayBadges.length > 0) {
    return snapshot.displayBadges.map((badge) => badgeGlyph(badge.type)).join("");
  }
  if (snapshot.badges.length > 0) {
    return snapshot.badges.slice(0, 3).map((badge) => badgeGlyph(badge.type)).join("");
  }
  return "*";
}
