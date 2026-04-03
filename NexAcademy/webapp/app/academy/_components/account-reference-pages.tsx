"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { normalizeCampaignFlowState } from "@/lib/campaign-flow-state";
import { normalizeCampaignModules } from "@/lib/campaign-modules";
import {
  badgeClassName,
  badgeDisplayText,
  badgeGlyph,
  formatUsdc,
  shortAddr,
  type UserCampaign,
  useAcademyAccountSnapshot,
} from "./account-data";

type DashboardTab = "overview" | "ranks" | "badges" | "scan";
type MultiplierKey =
  | "consistentCampaigns"
  | "highQuizAverage"
  | "zeroFlags"
  | "onChainActive"
  | "agentCertified"
  | "crossProtocol"
  | "domainHolder"
  | "protocolSpecialist";

const MULTIPLIER_LABELS: Array<{ key: MultiplierKey; label: string }> = [
  { key: "consistentCampaigns", label: "3+ campaigns" },
  { key: "highQuizAverage", label: "High quiz average" },
  { key: "zeroFlags", label: "Zero flags" },
  { key: "onChainActive", label: "Active wallet" },
  { key: "agentCertified", label: "Agent passed" },
  { key: "crossProtocol", label: "Cross-protocol" },
  { key: "domainHolder", label: ".id holder" },
  { key: "protocolSpecialist", label: "Protocol specialist" },
];

const LOCKED_BADGES = [
  { type: "DEFI_FLUENT", label: "4 wks left" },
  { type: "AGENT_CERTIFIED", label: "Invite needed" },
  { type: "CHARTERED", label: "Locked" },
];

const OVERVIEW_MULTIPLIER_ORDER: MultiplierKey[] = [
  "onChainActive",
  "domainHolder",
  "consistentCampaigns",
  "agentCertified",
  "crossProtocol",
];

const IDENTITY_MULTIPLIER_ORDER: MultiplierKey[] = [
  "onChainActive",
  "domainHolder",
  "consistentCampaigns",
  "agentCertified",
];

const MULTIPLIER_TARGET_FACTORS: Record<MultiplierKey, number> = {
  consistentCampaigns: 1.15,
  highQuizAverage: 1.12,
  zeroFlags: 1.1,
  onChainActive: 1.13,
  agentCertified: 1.2,
  crossProtocol: 1.1,
  domainHolder: 1.08,
  protocolSpecialist: 1.05,
};

function percent(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function yearsSince(dateString: string | null | undefined) {
  if (!dateString) return "0 yrs";
  const start = new Date(dateString);
  if (Number.isNaN(start.getTime())) return "0 yrs";
  const diff = Date.now() - start.getTime();
  const years = diff / (1000 * 60 * 60 * 24 * 365.25);
  return `${years.toFixed(years >= 2 ? 1 : 2)} yrs`;
}

function relativeTimeFrom(dateString: string | null | undefined) {
  if (!dateString) return "—";
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return "—";

  const diffMs = Date.now() - value.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.round(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function tierLabel(score: number) {
  if (score >= 900) return "Chartered";
  if (score >= 800) return "Analyst";
  if (score >= 650) return "Verified";
  if (score >= 450) return "Apprentice";
  return "Candidate";
}

function identityNameParts(displayName: string | null | undefined) {
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

function formatMultiplierFactor(value: number) {
  return `+${value.toFixed(2)}×`;
}

function multiplierFactorForDisplay(key: MultiplierKey, value: number, active: boolean) {
  return active ? value : MULTIPLIER_TARGET_FACTORS[key];
}

function buildMultiplierLookup(
  chips: Array<{ key: MultiplierKey; label: string; value: number; active: boolean }>,
) {
  return new Map(chips.map((chip) => [chip.key, chip]));
}

function campaignProgressPercent(campaign: UserCampaign) {
  const moduleGroups = normalizeCampaignModules(campaign.modules);
  if (campaign.completedAt) {
    return 100;
  }
  if (moduleGroups.length === 0) {
    return 0;
  }

  const flowState = normalizeCampaignFlowState(campaign.flowState);
  const completedViaCompatibility =
    Number.isInteger(campaign.completedUntil) && campaign.completedUntil >= 0
      ? Math.min(moduleGroups.length, campaign.completedUntil + 1)
      : 0;
  const completedViaFlowState = Math.min(
    moduleGroups.length,
    flowState.completedGroupIndexes.length,
  );
  const completedGroups = Math.max(completedViaCompatibility, completedViaFlowState);

  if (
    completedGroups >= moduleGroups.length ||
    flowState.activeStage === "QUIZ_ASSESSMENT" ||
    flowState.activeStage === "LIVE_AI_PREP" ||
    flowState.activeStage === "LIVE_AI_ASSESSMENT" ||
    flowState.activeStage === "RESULTS"
  ) {
    return 100;
  }

  const basePercent = Math.round((completedGroups / moduleGroups.length) * 100);
  if (!flowState.hasStartedFlow) {
    return basePercent;
  }

  return Math.max(5, basePercent);
}

function buildCourseProgressRows(campaigns: UserCampaign[]) {
  const decorated = campaigns.map((campaign) => {
    const progress = campaignProgressPercent(campaign);
    return {
      campaign,
      progress,
      isComplete: progress >= 100 || !!campaign.completedAt,
    };
  });

  const rows: typeof decorated = [];
  const mostRecentCompleted = decorated.find((row) => row.isComplete);
  const mostRecentActive = decorated.find((row) => !row.isComplete);

  if (mostRecentCompleted) {
    rows.push(mostRecentCompleted);
  }
  if (mostRecentActive && !rows.some((row) => row.campaign.campaignId === mostRecentActive.campaign.campaignId)) {
    rows.push(mostRecentActive);
  }
  for (const row of decorated) {
    if (rows.length >= 2) {
      break;
    }
    if (!rows.some((entry) => entry.campaign.campaignId === row.campaign.campaignId)) {
      rows.push(row);
    }
  }

  return rows.slice(0, 2).map((row) => ({
    title: row.campaign.title,
    status: row.isComplete ? "Complete" : `${row.progress}%`,
    width: row.progress,
    color: row.isComplete ? "var(--green)" : "var(--gold)",
    statusColor: row.isComplete ? "var(--green)" : "var(--gold)",
  }));
}

function useMultiplierChips(snapshot: ReturnType<typeof useAcademyAccountSnapshot>) {
  return useMemo(() => {
    return MULTIPLIER_LABELS.map((item) => {
      const value = snapshot.multiplier?.multiplier?.[item.key] ?? 1;
      const signal = snapshot.multiplier?.signals?.[item.key] ?? null;
      return {
        key: item.key,
        label: signal ?? item.label,
        value,
        active: value > 1,
      };
    });
  }, [snapshot.multiplier]);
}

export function ReferenceDashboardPage() {
  const snapshot = useAcademyAccountSnapshot();
  const chips = useMultiplierChips(snapshot);
  const chipLookup = useMemo(() => buildMultiplierLookup(chips), [chips]);
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const nameParts = identityNameParts(snapshot.displayName);

  const completedCampaigns = snapshot.userCampaigns.filter((campaign) => !!campaign.completedAt);
  const avgQuizScore = completedCampaigns.length > 0
    ? Math.round(completedCampaigns.reduce((sum, campaign) => sum + campaign.score, 0) / completedCampaigns.length)
    : 0;
  const platformRows = snapshot.leaderboard.filter((row) => row.campaignsFinished > 0);
  const platformAverage = platformRows.length > 0
    ? Math.round(
        platformRows.reduce(
          (sum, row) => sum + Math.min(100, row.totalScore / row.campaignsFinished),
          0,
        ) / platformRows.length,
      )
    : 0;
  const scanRows = snapshot.passport?.recentScans.slice(0, 8) ?? [];
  const earnedBadges = snapshot.badges.slice(0, 8);
  const lockedBadges = LOCKED_BADGES.filter(
    (badge) => !snapshot.badges.some((earned) => earned.type === badge.type),
  );
  const progressRows = buildCourseProgressRows(snapshot.userCampaigns);
  const rankRows = snapshot.userCampaigns.slice(0, 2);
  const overviewChips = OVERVIEW_MULTIPLIER_ORDER.map((key) => {
    const chip = chipLookup.get(key);
    return {
      key,
      label: chip?.label ?? MULTIPLIER_LABELS.find((item) => item.key === key)?.label ?? key,
      value: chip?.value ?? 1,
      active: chip?.active ?? false,
    };
  });

  return (
    <section>
      <div className="dash-head-row">
        <div>
          <div className="ey ey-gold" style={{ marginBottom: 6 }}>My Dashboard</div>
          <h1 className="dash-h1">
            {nameParts.base}
            {nameParts.suffix ? <span style={{ color: "var(--gold)" }}>{nameParts.suffix}</span> : null}
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--green-d)",
              border: "1px solid rgba(30,194,106,.16)",
              borderRadius: 6,
              padding: "4px 10px",
              fontFamily: "var(--mono)",
              fontSize: 9,
              color: "var(--green)",
              letterSpacing: ".1em",
              textTransform: "uppercase",
            }}
          >
            <span className="live-dot" style={{ width: 4, height: 4 }} />
            Scan active
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-lbl">Score</div>
          <div className="stat-val" style={{ color: "var(--gold)" }}>{snapshot.scoreOutOfThousand}</div>
          <div className="stat-sub">/ 1000 · {tierLabel(snapshot.scoreOutOfThousand)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Global Rank</div>
          <div className="stat-val">{snapshot.userRow ? `#${snapshot.userRow.rank}` : "—"}</div>
          <div className="stat-sub">of {snapshot.leaderboard.length.toLocaleString()} verified</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Multiplier</div>
          <div className="stat-val" style={{ color: "var(--purple)" }}>{snapshot.multiplierTotal.toFixed(2)}×</div>
          <div className="stat-sub">All campaigns</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Bot Flags</div>
          <div className="stat-val" style={{ color: "var(--green)" }}>0</div>
          <div className="stat-sub">Lifetime clean</div>
        </div>
      </div>

      <div className="vtabs">
        {[
          { key: "overview", label: "Overview" },
          { key: "ranks", label: "Campaign Ranks" },
          { key: "badges", label: "Badges" },
          { key: "scan", label: "On-Chain Scan" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`vt ${activeTab === tab.key ? "on" : ""}`}
            onClick={() => setActiveTab(tab.key as DashboardTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={`vtp ${activeTab === "overview" ? "on" : ""}`}>
        <div className="dash-2col">
          <div className="pxs" style={{ padding: 15 }}>
            <div className="ey" style={{ marginBottom: 11 }}>Course Progress</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {progressRows.length > 0 ? progressRows.map((row) => (
                <div key={row.title}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: "var(--t2)" }}>{row.title}</span>
                    <span style={{ color: row.statusColor, fontFamily: "var(--mono)" }}>
                      {row.status}
                    </span>
                  </div>
                  <div className="mini-bar">
                    <div className="mini-bar-fill" style={{ width: `${row.width}%`, background: row.color }} />
                  </div>
                </div>
              )) : (
                <div style={{ fontSize: 12, color: "var(--t3)" }}>No course activity yet.</div>
              )}
            </div>
          </div>

          <div className="pxs" style={{ padding: 15 }}>
            <div className="ey" style={{ marginBottom: 11 }}>Score Breakdown</div>
            <div>
              <div className="dsb-row">
                <span className="dsb-lbl">Quiz Accuracy</span>
                <div className="dsb-track"><div className="dsb-fill" style={{ width: `${avgQuizScore}%`, background: "var(--purple)" }} /></div>
                <span className="dsb-val">{avgQuizScore}</span>
              </div>
              <div className="dsb-row">
                <span className="dsb-lbl">Campaigns</span>
                <div className="dsb-track"><div className="dsb-fill" style={{ width: `${percent(snapshot.completedCampaigns, 5)}%`, background: "var(--gold)" }} /></div>
                <span className="dsb-val">{snapshot.completedCampaigns}</span>
              </div>
              <div className="dsb-row">
                <span className="dsb-lbl">On-Chain</span>
                <div className="dsb-track"><div className="dsb-fill" style={{ width: `${percent(snapshot.passport?.score?.crossProtocolCount ?? 0, 10)}%`, background: "var(--green)" }} /></div>
                <span className="dsb-val">{snapshot.passport?.score?.crossProtocolCount ?? 0}</span>
              </div>
              <div className="dsb-row">
                <span className="dsb-lbl">Agent Sessions</span>
                <div className="dsb-track"><div className="dsb-fill" style={{ width: `${percent(snapshot.passedAssessments.length, 3)}%`, background: "var(--blue)" }} /></div>
                <span className="dsb-val">{snapshot.passedAssessments.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pxs" style={{ padding: 15 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="ey">Active Multipliers</div>
            <div style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: 20, color: "var(--gold)", letterSpacing: "-.04em" }}>
              {snapshot.multiplierTotal.toFixed(2)}×
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {overviewChips.map((chip) => (
              <div
                key={chip.key}
                style={{
                  background: chip.active ? "var(--s3)" : "var(--s2)",
                  border: chip.active ? "1px solid rgba(30,194,106,.18)" : "1px solid var(--b1)",
                  borderRadius: 7,
                  padding: "5px 10px",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  opacity: chip.active ? 1 : 0.4,
                }}
              >
                <span style={{ color: chip.active ? "var(--green)" : "var(--t4)", fontSize: 10 }}>{chip.active ? "✓" : "○"}</span>
                <span style={{ color: chip.active ? "var(--t2)" : "var(--t3)" }}>{chip.label}</span>
                <span style={{ color: chip.active ? "var(--green)" : "var(--t4)", fontFamily: "var(--mono)", fontSize: 10 }}>
                  {formatMultiplierFactor(multiplierFactorForDisplay(chip.key, chip.value, chip.active))}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 11, fontFamily: "var(--mono)", fontSize: 10, color: "var(--t4)" }}>
            Theoretical maximum: 3.2×
          </div>
        </div>
      </div>

        <div className={`vtp ${activeTab === "ranks" ? "on" : ""}`}>
          <div className="panel" style={{ overflow: "hidden", marginBottom: 10 }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--b1)", fontFamily: "var(--dis)", fontWeight: 700, fontSize: 13, letterSpacing: "-.02em" }}>
              Campaign Performance
            </div>
          {rankRows.length > 0 ? rankRows.map((campaign) => (
            <div key={campaign.campaignId} className="camp-rank-row">
              <div className="crr-ico">{campaign.sponsorName.slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div className="crr-name">{campaign.title}</div>
                <div className="crr-meta">
                  {new Date(campaign.enrolledAt).toLocaleDateString()} · Score {campaign.score}/100 · {campaign.completedAt ? "Completed" : "In progress"}
                </div>
              </div>
              <div>
                <div className="crr-rank" style={{ color: campaign.rank ? "var(--gold)" : "var(--t3)" }}>
                  {campaign.rank ? `#${campaign.rank}` : "—"}
                </div>
                <div className="crr-sub">
                  {campaign.rank
                    ? `of ${snapshot.leaderboard.length.toLocaleString()}`
                    : campaign.completedAt
                    ? "Completed"
                    : "In progress"}
                </div>
              </div>
            </div>
          )) : (
            <div className="camp-rank-row">
              <div className="crr-ico">N</div>
              <div style={{ flex: 1 }}>
                <div className="crr-name">No campaigns yet</div>
                <div className="crr-meta">Start a course to populate your rank history.</div>
              </div>
              <div>
                <div className="crr-rank" style={{ color: "var(--t3)" }}>—</div>
                <div className="crr-sub">Idle</div>
              </div>
            </div>
          )}
        </div>
        <div className="pxs" style={{ padding: 15 }}>
          <div className="ey" style={{ marginBottom: 11 }}>Score vs Platform Average</div>
          <div>
            <div className="dsb-row">
              <span className="dsb-lbl">Campaign Score</span>
              <div className="dsb-track"><div className="dsb-fill" style={{ width: `${avgQuizScore}%`, background: "var(--gold)" }} /></div>
              <span className="dsb-val" style={{ color: "var(--gold)" }}>{avgQuizScore}</span>
            </div>
            <div className="dsb-row">
              <span className="dsb-lbl">Platform Average</span>
              <div className="dsb-track"><div className="dsb-fill" style={{ width: `${percent(platformAverage, 100)}%`, background: "var(--t4)" }} /></div>
              <span className="dsb-val">{platformAverage}</span>
            </div>
            <div className="dsb-row">
              <span className="dsb-lbl">Global Score</span>
              <div className="dsb-track"><div className="dsb-fill" style={{ width: `${percent(snapshot.scoreOutOfThousand, 1000)}%`, background: "var(--blue)" }} /></div>
              <span className="dsb-val" style={{ color: "var(--blue)" }}>{snapshot.scoreOutOfThousand}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={`vtp ${activeTab === "badges" ? "on" : ""}`}>
        <div className="pxs" style={{ padding: 15, marginBottom: 10 }}>
          <div className="ey ey-green" style={{ marginBottom: 11 }}>Earned</div>
          <div style={{ marginBottom: 14 }}>
            {earnedBadges.length > 0 ? earnedBadges.map((badge) => (
              <div key={badge.id} className={`badge-chip ${badgeClassName(badge.type)}`}>
                {badgeGlyph(badge.type)} {badge.name ?? badge.type.replaceAll("_", " ")}
              </div>
            )) : (
              <div style={{ fontSize: 11, color: "var(--t3)" }}>No badges earned yet.</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {earnedBadges.slice(0, 3).map((badge) => (
              <div key={`${badge.id}-row`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--b1)" }}>
                <div style={{ fontSize: 18, width: 22, textAlign: "center", flexShrink: 0 }}>{badgeGlyph(badge.type)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t)" }}>{badge.name ?? badge.type.replaceAll("_", " ")}</div>
                  <div style={{ fontSize: 10, color: "var(--t4)" }}>{badge.description ?? "Earned through academy activity."}</div>
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--green)", background: "var(--green-d)", padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(30,194,106,.18)" }}>
                  Earned
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pxs" style={{ padding: 15 }}>
          <div className="ey" style={{ color: "var(--t4)", marginBottom: 11 }}>Not Yet Earned</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {lockedBadges.map((badge, index) => (
              <div
                key={badge.type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 0",
                  borderBottom: index < lockedBadges.length - 1 ? "1px solid var(--b1)" : "none",
                  opacity: badge.type === "DEFI_FLUENT" ? 0.55 : badge.type === "AGENT_CERTIFIED" ? 0.4 : 0.3,
                }}
              >
                <div style={{ fontSize: 18, width: 22, textAlign: "center", flexShrink: 0 }}>{badgeGlyph(badge.type)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t)" }}>{badge.type.replaceAll("_", " ")}</div>
                  <div style={{ fontSize: 10, color: "var(--t4)" }}>
                    {badge.type === "DEFI_FLUENT"
                      ? "8 consecutive weeks, 2+ partner protocols"
                      : badge.type === "AGENT_CERTIFIED"
                      ? "Pass a live agent session — top N invite only"
                      : "Top 0.5% globally — 3+ agent sessions"}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    color: badge.type === "DEFI_FLUENT" ? "var(--gold)" : "var(--t3)",
                    background: badge.type === "DEFI_FLUENT" ? "var(--gold-d)" : "var(--s3)",
                    padding: "2px 7px",
                    borderRadius: 4,
                    border: badge.type === "DEFI_FLUENT" ? "1px solid var(--gold-m)" : "1px solid var(--b1)",
                  }}
                >
                  {badge.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`vtp ${activeTab === "scan" ? "on" : ""}`}>
        <div className="stat-grid" style={{ marginBottom: 10 }}>
          <div className="stat-card">
            <div className="stat-lbl">Wallet Age</div>
            <div className="stat-val" style={{ fontSize: 18 }}>{yearsSince(snapshot.profile?.createdAt)}</div>
            <div className="stat-sub">Connected</div>
          </div>
          <div className="stat-card">
            <div className="stat-lbl">Protocols Used</div>
            <div className="stat-val">{snapshot.passport?.score?.crossProtocolCount ?? 0}</div>
            <div className="stat-sub">Detected on-chain</div>
          </div>
          <div className="stat-card">
            <div className="stat-lbl">Consecutive Weeks</div>
            <div className="stat-val" style={{ color: "var(--blue)" }}>{snapshot.passport?.score?.consecutiveActiveWeeks ?? 0}</div>
            <div className="stat-sub">DeFi Active earned</div>
          </div>
          <div className="stat-card">
            <div className="stat-lbl">Last Scan</div>
            <div className="stat-val" style={{ fontSize: 16 }}>
              {relativeTimeFrom(snapshot.passport?.score?.lastScannedAt)}
            </div>
            <div className="stat-sub">{snapshot.passport?.score?.scanCadence ?? "Weekly"} cadence</div>
          </div>
        </div>

        <div className="panel" style={{ overflow: "hidden" }}>
          <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--dis)", fontWeight: 700, fontSize: 13, letterSpacing: "-.02em" }}>
            <span className="live-dot" style={{ width: 4, height: 4 }} />
            Recent Scan Activity
          </div>
          {scanRows.length > 0 ? scanRows.map((scan, index) => {
            const color = scan.txCount > 0 ? "g" : "gold";
            return (
              <div key={`${scan.scanDate}-${index}`} className="scan-feed-row">
                <div className={`sfd sfd-${color}`} />
                <div className="sft">
                  Chain {scan.chainId} scan detected {scan.txCount} txs across {scan.contractsInteracted} contracts
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    color: color === "g" ? "var(--green)" : "var(--gold)",
                    background: "rgba(255,255,255,.04)",
                    padding: "2px 7px",
                    borderRadius: 4,
                    flexShrink: 0,
                  }}
                >
                  {scan.activeDays}d active
                </div>
                <div className="sfm">{relativeTimeFrom(scan.scanDate)}</div>
              </div>
            );
          }) : (
            <div className="scan-feed-row">
              <div className="sfd sfd-gold" />
              <div className="sft">No scan activity yet. Complete campaigns and connect wallet activity to populate this feed.</div>
              <div className="sfm">Idle</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function ReferenceIdentityPage() {
  const snapshot = useAcademyAccountSnapshot();
  const chips = useMultiplierChips(snapshot);
  const chipLookup = useMemo(() => buildMultiplierLookup(chips), [chips]);
  const completedScores = snapshot.userCampaigns.filter((campaign) => !!campaign.completedAt);
  const averageCompletedScore = completedScores.length > 0
    ? Math.round(completedScores.reduce((sum, campaign) => sum + campaign.score, 0) / completedScores.length)
    : 0;
  const strokeOffset = 263.9 - (263.9 * snapshot.scoreOutOfThousand) / 1000;
  const displayBadges = snapshot.displayBadges.length > 0 ? snapshot.displayBadges : snapshot.badges.slice(0, 3);
  const nameParts = identityNameParts(snapshot.displayName);
  const identityChips = IDENTITY_MULTIPLIER_ORDER.map((key) => {
    const chip = chipLookup.get(key);
    return {
      key,
      label: chip?.label ?? MULTIPLIER_LABELS.find((item) => item.key === key)?.label ?? key,
      value: chip?.value ?? 1,
      active: chip?.active ?? false,
    };
  });
  const displayIdentity = `${badgeDisplayText(displayBadges)} ${nameParts.base}${nameParts.suffix}`.trim();

  return (
    <section>
      <div style={{ marginBottom: 18 }}>
        <div className="ey ey-gold" style={{ marginBottom: 8 }}>Identity Layer</div>
        <h1 style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: "clamp(1.4rem,3vw,2rem)", letterSpacing: "-.045em", color: "#fff" }}>
          {nameParts.base}
          {nameParts.suffix ? <span style={{ color: "var(--gold)" }}>{nameParts.suffix}</span> : null}
        </h1>
      </div>

      <div className="id-2col">
        <div>
          <div className="id-card">
            <div className="id-card-scan" />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div className="score-arc">
                <svg width="106" height="106" viewBox="0 0 106 106">
                  <circle cx="53" cy="53" r="42" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="8" />
                  <circle
                    cx="53"
                    cy="53"
                    r="42"
                    fill="none"
                    stroke="var(--gold)"
                    strokeWidth="8"
                    strokeDasharray="263.9"
                    strokeDashoffset={strokeOffset}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="score-mid">
                  <div className="score-num">{snapshot.scoreOutOfThousand}</div>
                  <div className="score-denom">/ 1000</div>
                </div>
              </div>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div className="id-name">
                  {nameParts.base}
                  {nameParts.suffix ? <span className="id-name-dot">{nameParts.suffix}</span> : null}
                </div>
                <div className="id-tier">{tierLabel(snapshot.scoreOutOfThousand)} Verified</div>
              </div>
              <div>
                <div className="dsb-row">
                  <span className="dsb-lbl">Quiz Accuracy</span>
                  <div className="dsb-track"><div className="dsb-fill" style={{ width: `${averageCompletedScore}%`, background: "var(--purple)" }} /></div>
                  <span className="dsb-val">{averageCompletedScore}</span>
                </div>
                <div className="dsb-row">
                  <span className="dsb-lbl">Campaigns</span>
                  <div className="dsb-track"><div className="dsb-fill" style={{ width: `${percent(snapshot.completedCampaigns, 5)}%`, background: "var(--gold)" }} /></div>
                  <span className="dsb-val">{snapshot.completedCampaigns}</span>
                </div>
                <div className="dsb-row">
                  <span className="dsb-lbl">On-Chain</span>
                  <div className="dsb-track"><div className="dsb-fill" style={{ width: `${percent(snapshot.passport?.score?.crossProtocolCount ?? 0, 10)}%`, background: "var(--green)" }} /></div>
                  <span className="dsb-val">{snapshot.passport?.score?.crossProtocolCount ?? 0}</span>
                </div>
                <div className="dsb-row">
                  <span className="dsb-lbl">Agent Sessions</span>
                  <div className="dsb-track"><div className="dsb-fill" style={{ width: `${percent(snapshot.passedAssessments.length, 3)}%`, background: "var(--blue)" }} /></div>
                  <span className="dsb-val">{snapshot.passedAssessments.length}</span>
                </div>
                <div className="dsb-row">
                  <span className="dsb-lbl">Bot Flags</span>
                  <div className="dsb-track"><div className="dsb-fill" style={{ width: "0%", background: "var(--red)" }} /></div>
                  <span className="dsb-val" style={{ color: "var(--green)" }}>0</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pxs" style={{ padding: 14, marginBottom: 10 }}>
            <div className="ey" style={{ marginBottom: 9 }}>Wallet</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--t3)" }}>Address</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--gold)" }}>{shortAddr(snapshot.identityAddress ?? "") || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--t3)" }}>Chain</span>
                <span>{snapshot.identityAddress?.startsWith("0x") ? "Ethereum" : snapshot.identityAddress ? "Solana" : "Unlinked"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--t3)" }}>Wallet age</span>
                <span>{yearsSince(snapshot.profile?.createdAt)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--t3)" }}>Global rank</span>
                <span style={{ color: "var(--gold)", fontFamily: "var(--mono)" }}>{snapshot.userRow ? `#${snapshot.userRow.rank}` : "—"}</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="pxs" style={{ padding: 15, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
              <div className="ey">Multipliers</div>
              <div style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: 20, color: "var(--gold)", letterSpacing: "-.04em" }}>
                {snapshot.multiplierTotal.toFixed(2)}×
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {identityChips.filter((chip) => chip.active).map((chip) => (
                <div key={chip.key} className="badge-chip bc-v">
                  ✓ {chip.label}
                  <span style={{ marginLeft: 3, color: "var(--green)" }}>
                    {formatMultiplierFactor(multiplierFactorForDisplay(chip.key, chip.value, chip.active))}
                  </span>
                </div>
              ))}
              {identityChips.filter((chip) => !chip.active).slice(0, 1).map((chip) => (
                <div key={`${chip.key}-locked`} className="badge-chip bc-lo">
                  ○ {chip.label} {formatMultiplierFactor(multiplierFactorForDisplay(chip.key, chip.value, chip.active))}
                </div>
              ))}
            </div>
          </div>

          <div className="pxs" style={{ padding: 15, marginBottom: 10 }}>
            <div className="ey" style={{ marginBottom: 10 }}>Badges</div>
            <div>
              {snapshot.badges.length > 0 ? snapshot.badges.slice(0, 5).map((badge) => (
                <div key={badge.id} className={`badge-chip ${badgeClassName(badge.type)}`}>
                  {badgeGlyph(badge.type)} {badge.name ?? badge.type.replaceAll("_", " ")}
                </div>
              )) : <div style={{ fontSize: 11, color: "var(--t3)" }}>No badges earned yet.</div>}
            </div>
            <div style={{ marginTop: 11, fontSize: 11, color: "var(--t3)", lineHeight: 1.65 }}>
              Displaying: <strong style={{ color: "var(--t)" }}>{displayIdentity}</strong> — visible on all leaderboards and partner protocol dashboards.
            </div>
          </div>

          <div className="pxs" style={{ padding: 15 }}>
            <div className="ey" style={{ marginBottom: 11 }}>What Your .id Unlocks</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--gold-d)", border: "1px solid var(--gold-m)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, marginTop: 1 }}>⚡</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t)", marginBottom: 2 }}>{snapshot.multiplierTotal.toFixed(2)}× Score Multiplier</div>
                  <div style={{ fontSize: 11, color: "var(--t4)" }}>Applies to every campaign you enter, permanently compounding as you earn more badges.</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--green-d)", border: "1px solid rgba(30,194,106,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, marginTop: 1 }}>🔗</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t)", marginBottom: 2 }}>Cross-Campaign Reputation</div>
                  <div style={{ fontSize: 11, color: "var(--t4)" }}>Immutable history every protocol using NexID can verify before your next campaign.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ReferenceEarningsPage() {
  const snapshot = useAcademyAccountSnapshot();
  const rows = snapshot.endedClaims
    .slice()
    .sort((a, b) => {
      const aTime = a.endAt ? new Date(a.endAt).getTime() : 0;
      const bTime = b.endAt ? new Date(b.endAt).getTime() : 0;
      return bTime - aTime;
    });

  return (
    <section>
      <div style={{ marginBottom: 18 }}>
        <div className="ey ey-gold" style={{ marginBottom: 8 }}>Rewards</div>
        <h1 style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: "clamp(1.4rem,3vw,2rem)", letterSpacing: "-.045em", color: "#fff" }}>
          Earnings
        </h1>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-lbl">Total Earned</div>
          <div className="stat-val" style={{ color: "var(--green)" }}>${formatUsdc(snapshot.earnedTotal)}</div>
          <div className="stat-sub">USDC confirmed</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Pending</div>
          <div className="stat-val" style={{ color: "var(--gold)" }}>${formatUsdc(snapshot.pendingTotal)}</div>
          <div className="stat-sub">At campaign close</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Claimed</div>
          <div className="stat-val">{snapshot.endedClaims.filter((claim) => claim.claimed).length}</div>
          <div className="stat-sub">Rewards paid</div>
        </div>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--b1)", fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--t4)" }}>
          History
        </div>
        {rows.length > 0 ? rows.map((claim) => {
          const isClaimed = claim.claimed;
          const ready = claim.claimReady && !claim.claimed;
          return (
            <div key={claim.campaignId} className="earn-history-row">
              <div
                className="ehi"
                style={{
                  background: isClaimed ? "var(--green-d)" : ready ? "var(--gold-d)" : "var(--s2)",
                  border: isClaimed
                    ? "1px solid rgba(30,194,106,.18)"
                    : ready
                    ? "1px solid var(--gold-m)"
                    : "1px solid var(--b1)",
                  color: isClaimed ? "var(--green)" : ready ? "var(--gold)" : "var(--t3)",
                }}
              >
                {isClaimed ? "$" : ready ? "◈" : "•"}
              </div>
              <div style={{ flex: 1 }}>
                <div className="ehn">{claim.title}</div>
                <div className="ehm">
                  {claim.endAt ? new Date(claim.endAt).toLocaleDateString() : "Ended"}{claim.rank ? ` · Rank #${claim.rank}` : ""} · Score {claim.score}
                </div>
              </div>
              <div>
                <div className="eha" style={{ color: isClaimed ? "var(--green)" : ready ? "var(--gold)" : "var(--t2)" }}>
                  ${formatUsdc(claim.rewardAmountUsdc)}
                </div>
                <div className="ehr">
                  {isClaimed ? "Claimed" : ready ? "Ready to claim" : "Pending"}
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="earn-history-row">
            <div className="ehi" style={{ background: "var(--s2)", border: "1px solid var(--b1)", color: "var(--t3)" }}>•</div>
            <div style={{ flex: 1 }}>
              <div className="ehn">No earnings history yet</div>
              <div className="ehm">Complete prize-backed campaigns to populate this ledger.</div>
            </div>
            <div>
              <div className="eha" style={{ color: "var(--t3)" }}>$0</div>
            </div>
          </div>
        )}
      </div>

      {snapshot.activeCampaign ? (
        <div style={{ marginTop: 14 }}>
          <Link href={`/campaign/${snapshot.activeCampaign.campaignId}`} className="btn btn-outline btn-sm">
            Back to Active Campaign
          </Link>
        </div>
      ) : null}
    </section>
  );
}
