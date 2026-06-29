import type { AuthUser } from "@/lib/types/nexid";
import { requireDatabase } from "@/lib/server/db";

type Outcome = "ride" | "fade" | "invalid";
type ReviewerWorkbenchUser = AuthUser & { reviewerAccessId?: string };

type EvidenceItem = {
  title: string;
  body: string;
  meta: string;
  url: string | null;
  outcome: Outcome | null;
  createdAt: string | null;
};

function normalizeWallet(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function titleCase(value?: string | null) {
  if (!value) return null;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function outcomeLabel(value?: string | null) {
  if (value === "ride") return "Ride";
  if (value === "fade") return "Fade";
  if (value === "invalid") return "Invalid";
  return "Not proposed";
}

function formatUsd(value?: number | null) {
  const amount = Number(value ?? 0);
  const digits = Number.isInteger(amount) ? 0 : 2;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function formatDate(value?: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDeadline(value?: Date | string | null, now = new Date()) {
  if (!value) return "No deadline";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "No deadline";
  const seconds = Math.max(0, Math.floor((date.getTime() - now.getTime()) / 1000));
  if (seconds <= 0) return "Closed";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 48) return `${Math.ceil(hours / 24)}d`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function deadlineSeconds(value?: Date | string | null, now = new Date()) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((date.getTime() - now.getTime()) / 1000));
}

function progressBetween(start?: Date | string | null, end?: Date | string | null, now = new Date()) {
  if (!start || !end) return 0;
  const left = start instanceof Date ? start : new Date(start);
  const right = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return 0;
  const total = Math.max(1, right.getTime() - left.getTime());
  return Math.max(4, Math.min(98, Math.round(((now.getTime() - left.getTime()) / total) * 100)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringListFromJson(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  const record = asRecord(value);
  if (!record) return [];
  return Object.entries(record)
    .filter(([, item]) => Boolean(item))
    .map(([key, item]) => {
      if (typeof item === "string") return item;
      return titleCase(key) ?? key;
    });
}

function statusIsPaid(status?: string | null) {
  return ["CONFIRMED", "PAID", "AUTO_PAID", "AUTO-PAID", "COMPLETED"].includes((status ?? "").toUpperCase());
}

function activeAssignmentStatus(status?: string | null) {
  return !["revealed", "missed_reveal", "conflict_flagged", "finalized"].includes((status ?? "").toLowerCase());
}

function caseStatus(input: {
  assignmentStatus: string;
  panelStatus: string;
  hasPaidReward: boolean;
  rewardAmount: number;
  finalOutcome?: string | null;
}) {
  if (input.hasPaidReward && input.rewardAmount > 0) return "Paid";
  if (input.finalOutcome) return "Finalized";
  if (input.assignmentStatus === "revealed") return "Reveal submitted";
  if (input.assignmentStatus === "submitted") return "Commit submitted";
  if (input.panelStatus === "review_ready") return "Reveal window open";
  if (input.panelStatus === "open") return "Evidence Review open";
  return titleCase(input.panelStatus) ?? "Assigned";
}

function priorityLabel(input: { secondsLeft: number; pool: number; createdAt?: Date | null }) {
  if (input.secondsLeft <= 3600) return "Due now";
  if (input.secondsLeft <= 3 * 3600) return "Due soon";
  if (input.pool >= 250) return "High value";
  if (input.createdAt && Date.now() - input.createdAt.getTime() <= 24 * 3600 * 1000) return "New";
  return "Assigned";
}

function rewardEstimate(pool: number, assignmentCount: number, recordedReward: number) {
  if (recordedReward > 0) return formatUsd(recordedReward);
  if (pool <= 0) return "$0";
  const count = Math.max(1, assignmentCount);
  const base = (pool * 0.8) / count;
  const max = base + pool * 0.2;
  return `${formatUsd(base)}-${formatUsd(max)}`;
}

function initials(label: string) {
  const parts = label.replace(/\.id$/i, "").split(/[.\s_-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "R";
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? "V";
  return `${first}${second}`.toUpperCase();
}

function confidenceLabel(value?: number | null) {
  if (value == null) return null;
  if (value >= 0.8) return "High";
  if (value >= 0.5) return "Medium";
  return "Low";
}

function evidenceTitle(kind?: string | null) {
  if (!kind) return "Evidence";
  if (kind === "proposer_evidence") return "Proposer evidence";
  if (kind === "challenge_evidence") return "Challenger evidence";
  return titleCase(kind) ?? "Evidence";
}

function evidenceItems(input: {
  rows: Array<{
    kind: string;
    outcome: string | null;
    evidenceUrl: string | null;
    evidenceText: string | null;
    sourceUrl: string | null;
    auditSummary: string | null;
    metadata: unknown;
    createdAt: Date;
  }>;
  resolution?: {
    assertionClaim: string | null;
    evidence: unknown;
    evidenceHash: string | null;
    proposedAt: Date | null;
  } | null;
  sourceUrl?: string | null;
}) {
  const items: EvidenceItem[] = input.rows.map((row) => {
    const metadata = asRecord(row.metadata);
    const timestamp = stringValue(metadata?.evidenceTimestamp);
    return {
      title: evidenceTitle(row.kind),
      body: row.evidenceText || row.auditSummary || "Evidence row is recorded without text.",
      meta: timestamp || row.evidenceUrl || row.sourceUrl || formatDate(row.createdAt),
      url: row.evidenceUrl || row.sourceUrl,
      outcome: (row.outcome === "ride" || row.outcome === "fade" || row.outcome === "invalid") ? row.outcome : null,
      createdAt: row.createdAt.toISOString()
    };
  });

  const resolutionEvidence = asRecord(input.resolution?.evidence);
  const resolutionText = stringValue(resolutionEvidence?.evidenceText) ?? input.resolution?.assertionClaim ?? null;
  const resolutionUrl = stringValue(resolutionEvidence?.evidenceUrl) ?? stringValue(resolutionEvidence?.sourceUrl) ?? input.sourceUrl ?? null;
  if (resolutionText && !items.some((item) => item.body === resolutionText)) {
    items.push({
      title: "Resolution evidence",
      body: resolutionText,
      meta: input.resolution?.evidenceHash ? `Hash: ${input.resolution.evidenceHash.slice(0, 12)}...` : (resolutionUrl ?? "Recorded on resolution"),
      url: resolutionUrl,
      outcome: null,
      createdAt: input.resolution?.proposedAt?.toISOString() ?? null
    });
  }

  return items;
}

function latestByMarket<T extends { marketId: string; createdAt?: Date; updatedAt?: Date }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const previous = map.get(row.marketId);
    const rowDate = row.updatedAt ?? row.createdAt ?? new Date(0);
    const previousDate = previous ? (previous.updatedAt ?? previous.createdAt ?? new Date(0)) : new Date(0);
    if (!previous || rowDate > previousDate) map.set(row.marketId, row);
  }
  return map;
}

function chartPoint(label: string, rewards: Array<{ amountUsdc: number; status: string | null }>) {
  const paid = rewards.filter((reward) => statusIsPaid(reward.status));
  return {
    x: label,
    y: Number(paid.reduce((sum, reward) => sum + Number(reward.amountUsdc || 0), 0).toFixed(2)),
    cases: paid.length,
    status: paid.length ? "Paid" : "No payout"
  };
}

function buildEarningsCharts(rewards: Array<{ amountUsdc: number; status: string | null; createdAt: Date }>, now = new Date()) {
  const byDay = new Map<string, typeof rewards>();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    byDay.set(date.toISOString().slice(0, 10), []);
  }
  for (const reward of rewards) {
    const key = reward.createdAt.toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.get(key)?.push(reward);
  }
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sevenDays = Array.from(byDay.entries()).map(([key, rows]) => {
    const date = new Date(`${key}T00:00:00Z`);
    return chartPoint(dayNames[date.getUTCDay()] ?? key, rows);
  });

  const weeks = [0, 1, 2, 3, 4].map((index) => {
    const start = new Date(now);
    start.setDate(now.getDate() - (4 - index) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return chartPoint(index === 4 ? "Now" : `W${index + 1}`, rewards.filter((reward) => reward.createdAt >= start && reward.createdAt < end));
  });

  const monthly = [2, 1, 0].map((offset) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset + 1, 1));
    return chartPoint(start.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), rewards.filter((reward) => reward.createdAt >= start && reward.createdAt < end));
  });

  const monthKeys = new Map<string, typeof rewards>();
  for (const reward of rewards) {
    const key = reward.createdAt.toISOString().slice(0, 7);
    if (!monthKeys.has(key)) monthKeys.set(key, []);
    monthKeys.get(key)?.push(reward);
  }
  const life = Array.from(monthKeys.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, rows]) => {
      const date = new Date(`${key}-01T00:00:00Z`);
      return chartPoint(date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), rows);
    });

  return {
    "7D": sevenDays,
    "30D": weeks,
    "90D": monthly,
    Life: life.length ? life : [chartPoint("-", [])]
  };
}

export async function getReviewerWorkbench(user: ReviewerWorkbenchUser) {
  const db = requireDatabase();
  const wallet = user.walletAddress;
  const normalizedWallet = normalizeWallet(wallet);
  const now = new Date();

  const [userRow, proverProfile, assignments, rewards, reputationRows] = await Promise.all([
    db.user.findFirst({
      where: {
        OR: [
          { id: user.id },
          { walletAddress: { equals: wallet, mode: "insensitive" } }
        ]
      }
    }),
    db.proofFlowProver.findFirst({
      where: { walletAddress: { equals: wallet, mode: "insensitive" } }
    }),
    db.proofFlowReviewAssignment.findMany({
      where: { reviewerWallet: { equals: wallet, mode: "insensitive" } },
      include: {
        panel: { include: { _count: { select: { assignments: true } } } },
        rewards: true
      },
      orderBy: { updatedAt: "desc" }
    }),
    db.proofFlowReviewerReward.findMany({
      where: { reviewerWallet: { equals: wallet, mode: "insensitive" } },
      orderBy: { createdAt: "desc" }
    }),
    db.proofFlowReviewerReputationLedger.findMany({
      where: { reviewerWallet: { equals: wallet, mode: "insensitive" } },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const marketIds = Array.from(new Set([
    ...assignments.map((assignment) => assignment.marketId),
    ...rewards.map((reward) => reward.marketId)
  ]));

  let markets: Awaited<ReturnType<typeof db.market.findMany>> = [];
  let evidenceRows: Awaited<ReturnType<typeof db.proofFlowEvidenceSubmission.findMany>> = [];
  let resolutions: Awaited<ReturnType<typeof db.marketResolution.findMany>> = [];
  let receipts: Awaited<ReturnType<typeof db.proofFlowSettlementReceipt.findMany>> = [];

  if (marketIds.length) {
    [markets, evidenceRows, resolutions, receipts] = await Promise.all([
      db.market.findMany({ where: { id: { in: marketIds } } }),
      db.proofFlowEvidenceSubmission.findMany({
        where: { marketId: { in: marketIds } },
        orderBy: { createdAt: "asc" }
      }),
      db.marketResolution.findMany({
        where: { marketId: { in: marketIds } },
        orderBy: { updatedAt: "desc" }
      }),
      db.proofFlowSettlementReceipt.findMany({
        where: { marketId: { in: marketIds } },
        orderBy: { updatedAt: "desc" }
      })
    ]);
  }

  const marketMap = new Map(markets.map((market) => [market.id, market]));
  const latestResolution = latestByMarket(resolutions);
  const latestReceipt = latestByMarket(receipts);
  const evidenceByMarket = new Map<string, typeof evidenceRows>();
  for (const row of evidenceRows) {
    if (!evidenceByMarket.has(row.marketId)) evidenceByMarket.set(row.marketId, []);
    evidenceByMarket.get(row.marketId)?.push(row);
  }

  const cases = assignments.flatMap((assignment) => {
    const market = marketMap.get(assignment.marketId);
    if (!market) return [];
    const panel = assignment.panel;
    const resolution = latestResolution.get(market.id);
    const receipt = latestReceipt.get(market.id);
    const rows = evidenceByMarket.get(market.id) ?? [];
    const challengeRows = rows.filter((row) => row.kind.toLowerCase().includes("challenge"));
    const pool = Number(panel.rewardPoolUsdc || 0);
    const recordedReward = Number(assignment.rewardUsdc || 0);
    const paidReward = [...assignment.rewards, ...rewards.filter((reward) => reward.assignmentId === assignment.id)]
      .some((reward) => statusIsPaid(reward.status));
    const secondsLeft = deadlineSeconds(assignment.status === "submitted" ? panel.revealDeadline : panel.reviewDeadline, now);
    const flags = [
      ...stringListFromJson(panel.auditFlags),
      assignment.wrongSourceFlag ? "Wrong source flagged" : null,
      assignment.coordinatedFlag ? "Coordination flagged" : null,
      assignment.spamFlag ? "Spam flagged" : null,
      assignment.badFaithFlag ? "Bad-faith Prover note flagged" : null,
      assignment.conflictReason
    ].filter((item): item is string => Boolean(item));

    return [{
      id: market.id,
      assignmentId: assignment.id,
      panelId: panel.id,
      title: market.title,
      category: market.arena || "General",
      status: caseStatus({
        assignmentStatus: assignment.status,
        panelStatus: panel.status,
        hasPaidReward: paidReward,
        rewardAmount: recordedReward,
        finalOutcome: receipt?.finalOutcome ?? resolution?.finalOutcome ?? market.finalOutcome
      }),
      assignmentStatus: assignment.status,
      panelStatus: panel.status,
      priority: priorityLabel({ secondsLeft, pool, createdAt: assignment.createdAt }),
      reward: rewardEstimate(pool, panel._count.assignments, recordedReward),
      pool,
      deadline: formatDeadline(assignment.status === "submitted" ? panel.revealDeadline : panel.reviewDeadline, now),
      deadlineSeconds: secondsLeft,
      progress: progressBetween(panel.selectedAt, assignment.status === "submitted" ? panel.revealDeadline : panel.reviewDeadline, now),
      source: market.sourceQualificationStatus ? titleCase(market.sourceQualificationStatus) ?? "Locked source" : "Locked source",
      url: assignment.sourceUrl || market.sourceUrl || "",
      question: market.question,
      ride: market.yesRule || "Ride wins if the locked market condition is proven true from the resolution source.",
      fade: market.noRule || "Fade wins if the locked market condition is not proven true from the resolution source.",
      invalid: market.invalidRule || "Invalid if locked rules and evidence cannot prove Ride or Fade.",
      fallback: market.backupSourceUrl ? `Use fallback source ${market.backupSourceUrl} only if the primary source is unavailable.` : "No fallback source is recorded. If the locked source fails, apply the Invalid rule.",
      proposal: outcomeLabel(resolution?.proposedOutcome ?? market.provisionalOutcome),
      challenge: challengeRows[0] ? outcomeLabel(challengeRows[0].outcome) : "No challenge recorded",
      challengerEvidence: challengeRows.length > 0,
      history: panel.reason || panel.auditSummary || resolution?.auditSummary || market.auditSummary || "No audit note has been recorded for this case yet.",
      evidence: evidenceItems({
        rows,
        resolution,
        sourceUrl: market.sourceUrl
      }),
      flags,
      noteHash: assignment.noteHash,
      noteText: assignment.noteText,
      noteNonce: assignment.noteNonce,
      recommendedOutcome: assignment.recommendedOutcome,
      confidence: assignment.confidence,
      confidenceLabel: confidenceLabel(assignment.confidence),
      submittedAt: assignment.submittedAt?.toISOString() ?? null,
      revealedAt: assignment.revealedAt?.toISOString() ?? null,
      canCommit: panel.reviewDeadline > now && !assignment.submittedAt,
      canReveal: Boolean(assignment.submittedAt && !assignment.revealedAt),
      finalOutcome: receipt?.finalOutcome ?? resolution?.finalOutcome ?? market.finalOutcome,
      receiptHash: receipt?.receiptHash ?? null,
      receiptStatus: receipt?.settlementStatus ?? null
    }];
  });

  const activeCases = cases.filter((item) => activeAssignmentStatus(item.assignmentStatus) && item.status !== "Paid");
  const dueSoon = activeCases.filter((item) => item.deadlineSeconds <= 3 * 3600).length;
  const paidRewards = rewards.filter((reward) => statusIsPaid(reward.status));
  const pendingRewards = rewards.filter((reward) => !statusIsPaid(reward.status));
  const autoPaid = paidRewards.reduce((sum, reward) => sum + Number(reward.amountUsdc || 0), 0);
  const pending = pendingRewards.reduce((sum, reward) => sum + Number(reward.amountUsdc || 0), 0);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthRewards = paidRewards.filter((reward) => reward.createdAt >= monthStart);
  const monthTotal = monthRewards.reduce((sum, reward) => sum + Number(reward.amountUsdc || 0), 0);
  const reputationDelta = reputationRows.reduce((sum, row) => sum + Number(row.delta || 0), 0);
  const score = Number(userRow?.edgeScoreTotal ?? user.pointsTotal ?? 0) + reputationDelta;
  const topArena = Object.entries(cases.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {})).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const displayName = user.primaryDomainName || user.primaryIdName || user.displayName || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;

  const rowForReward = (reward: typeof rewards[number]) => {
    const market = marketMap.get(reward.marketId);
    return [
      market?.title ?? reward.marketId,
      formatUsd(reward.amountUsdc),
      reward.reason || titleCase(reward.rewardType) || titleCase(reward.status) || "Recorded reward"
    ] as [string, string, string];
  };

  const aggregateRewardRows = (rows: typeof rewards) => {
    const groups = rows.reduce<Record<string, { amount: number; count: number }>>((acc, row) => {
      const key = titleCase(row.rewardType) || "Prover reward";
      acc[key] = acc[key] ?? { amount: 0, count: 0 };
      acc[key].amount += Number(row.amountUsdc || 0);
      acc[key].count += 1;
      return acc;
    }, {});
    return Object.entries(groups).map(([key, value]) => [
      key,
      formatUsd(value.amount),
      `${value.count} ${value.count === 1 ? "reward row" : "reward rows"}`
    ] as [string, string, string]);
  };

  const history = assignments
    .filter((assignment) => assignment.revealedAt || assignment.rewards.length || latestReceipt.has(assignment.marketId))
    .map((assignment) => {
      const market = marketMap.get(assignment.marketId);
      const receipt = latestReceipt.get(assignment.marketId);
      const reward = rewards.find((item) => item.assignmentId === assignment.id);
      const auditAccepted = !assignment.penaltyReason && !assignment.wrongSourceFlag && !assignment.badFaithFlag && assignment.status !== "missed_reveal";
      return {
        marketId: assignment.marketId,
        assignmentId: assignment.id,
        market: market?.title ?? assignment.marketId,
        final: outcomeLabel(receipt?.finalOutcome ?? market?.finalOutcome),
        mine: outcomeLabel(assignment.recommendedOutcome),
        audit: auditAccepted ? "Accepted" : "Not accepted",
        reward: formatUsd(reward?.amountUsdc ?? assignment.rewardUsdc),
        note: reward?.reason || assignment.penaltyReason || assignment.conflictReason || "Submission recorded with the Prover assignment.",
        date: formatDate(receipt?.finalizedAt ?? assignment.revealedAt ?? assignment.updatedAt)
      };
    });

  const proverSummary = {
      id: user.id,
      walletAddress: wallet,
      displayName,
      initials: initials(displayName),
      tier: proverProfile?.genesisBadge ? "Genesis Prover" : userRow?.rewardLevel ?? "Prover",
      badge: proverProfile?.genesisBadge ? "Genesis Prover" : userRow?.rewardBadge ?? "ProofFlow Prover",
      score: proverProfile?.reputation ?? score,
      reputation: proverProfile?.reputation ?? score,
      accuracy: proverProfile?.accuracy ?? 0,
      completedSettlements: proverProfile?.completedSettlements ?? assignments.filter((assignment) => assignment.revealedAt).length,
      status: proverProfile?.status ?? "ACTIVE",
      specialty: topArena ? `${topArena} specialist` : "Active Prover",
      progress: Math.max(4, Math.min(100, Math.round((proverProfile?.reputation ?? score) / 10)))
  };

  return {
    prover: proverSummary,
    reviewer: proverSummary,
    stats: {
      activeCases: activeCases.length,
      dueSoon,
      autoPaid: formatUsd(autoPaid),
      reviewerScore: score,
      reviewerTier: proverSummary.tier,
      proverScore: proverSummary.reputation,
      proverTier: proverSummary.tier,
      proverAccuracy: `${proverSummary.accuracy.toFixed(1)}%`,
      completedSettlements: proverSummary.completedSettlements,
      pending: formatUsd(pending),
      thisMonth: formatUsd(monthTotal),
      lifetime: formatUsd(autoPaid),
      validSubmissions: assignments.filter((assignment) => assignment.submittedAt).length,
      topNoteWins: rewards.filter((reward) => reward.rewardType.includes("top_note")).length,
      noRewardReviews: rewards.filter((reward) => Number(reward.amountUsdc || 0) === 0).length
    },
    cases,
    history,
    earnings: {
      chart: buildEarningsCharts(rewards, now),
      details: {
        pending: {
          title: "Pending earnings",
          amount: formatUsd(pending),
          body: "Submitted Prover notes waiting for final settlement or reward calculation before Provers Pool release.",
          rows: pendingRewards.map(rowForReward)
        },
        paid: {
          title: "Released earnings",
          amount: formatUsd(autoPaid),
          body: "Rewards marked paid or confirmed from the Provers Pool after settlement.",
          rows: paidRewards.map(rowForReward)
        },
        month: {
          title: "This month",
          amount: formatUsd(monthTotal),
          body: "Prover income marked paid or confirmed this month, excluding pending rewards.",
          rows: aggregateRewardRows(monthRewards)
        },
        lifetime: {
          title: "Lifetime earnings",
          amount: formatUsd(autoPaid),
          body: "All Prover income marked paid or confirmed for this Prover wallet.",
          rows: [
            ["Valid submissions", String(assignments.filter((assignment) => assignment.submittedAt).length), "Counted Prover commits"],
            ["Top note wins", String(rewards.filter((reward) => reward.rewardType.includes("top_note")).length), "Bonus-winning notes"],
            ["No-reward reviews", String(rewards.filter((reward) => Number(reward.amountUsdc || 0) === 0).length), "Minority, reputation-only, or rejected submissions"]
          ]
        }
      }
    },
    meta: {
      wallet: normalizedWallet,
      generatedAt: now.toISOString()
    }
  };
}
