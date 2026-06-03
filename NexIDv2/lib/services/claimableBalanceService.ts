import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import type { JsonInput } from "@/lib/types/json";

type PayMode = "wallet" | "referral" | "edge" | "auto";
type CreditSource = "edge_reward";

export type ClaimableBalanceSummary = {
  referral: {
    availableUsd: number;
    reservedUsd: number;
    spentUsd: number;
    claimedUsd: number;
  };
  edge: {
    availableUsd: number;
    lockedUsd: number;
    usableForMintUsd: number;
    reservedUsd: number;
    spentUsd: number;
    claimedUsd: number;
  };
  totalAvailableUsd: number;
  totalLockedUsd: number;
  totalUsableForMintUsd: number;
  totalReservedUsd: number;
  totalSpentUsd: number;
  totalClaimRequestedUsd: number;
  totalClaimedUsd: number;
};

export type ClaimablePaymentPlan = {
  mode: PayMode;
  priceUsd: number;
  referralCreditUsd: number;
  edgeRewardCreditUsd: number;
  walletUsd: number;
  creditUsd: number;
  requiresWalletTransaction: boolean;
};

const CLAIMABLE_REWARD_STATUSES = ["approved", "locked_id_required"] as const;
const ACTIVE_LEDGER_STATUSES = ["claimable", "locked_id_required", "reserved", "payment_received", "spent", "claim_requested", "claim_authorized", "paid"];
const ZERO_SUMMARY: ClaimableBalanceSummary = {
  referral: { availableUsd: 0, reservedUsd: 0, spentUsd: 0, claimedUsd: 0 },
  edge: { availableUsd: 0, lockedUsd: 0, usableForMintUsd: 0, reservedUsd: 0, spentUsd: 0, claimedUsd: 0 },
  totalAvailableUsd: 0,
  totalLockedUsd: 0,
  totalUsableForMintUsd: 0,
  totalReservedUsd: 0,
  totalSpentUsd: 0,
  totalClaimRequestedUsd: 0,
  totalClaimedUsd: 0
};

function roundUsd(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizePayMode(value?: string | null): PayMode {
  const clean = String(value ?? "wallet").toLowerCase();
  if (clean.includes("referral")) return "referral";
  if (clean.includes("edge")) return "edge";
  if (clean.includes("auto") || clean.includes("split")) return "auto";
  return "wallet";
}

function walletError(mode: PayMode, available: number, price: number) {
  if (mode === "referral") return "Referral mint payouts are paid directly by NexDomains during the domain mint transaction, so there is no NexMarkets referral balance to spend.";
  if (mode === "edge") return `EdgeBoard reward balance is ${roundUsd(available).toFixed(2)} USDC. Add rewards or use Wallet for this .id mint.`;
  return `EdgeBoard reward balance is ${roundUsd(available).toFixed(2)} USDC. Add rewards or use Wallet for this .id mint.`;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function summaryFromRows(rows: Array<{ sourceType: string; entryType?: string; status: string; amountUsd: number }>): ClaimableBalanceSummary {
  const active = rows.filter((row) => ACTIVE_LEDGER_STATUSES.includes(row.status));
  const creditFor = (source: CreditSource, status: string) => roundUsd(active
    .filter((row) => row.sourceType === source && row.status === status && row.amountUsd > 0)
    .reduce((sum, row) => sum + row.amountUsd, 0));
  const debitFor = (source: CreditSource) => roundUsd(Math.abs(active
    .filter((row) => row.sourceType === source && row.amountUsd < 0)
    .reduce((sum, row) => sum + row.amountUsd, 0)));
  const amountFor = (source: CreditSource, status: string) => roundUsd(Math.abs(rows
    .filter((row) => row.sourceType === source && row.status === status)
    .reduce((sum, row) => sum + row.amountUsd, 0)));
  const referral = { availableUsd: 0, reservedUsd: 0, spentUsd: 0, claimedUsd: 0 };
  const edgeClaimableCredit = creditFor("edge_reward", "claimable");
  const edgeLockedCredit = creditFor("edge_reward", "locked_id_required");
  const edgeDebits = debitFor("edge_reward");
  const lockedAfterDebits = Math.max(0, roundUsd(edgeLockedCredit - edgeDebits));
  const debitRemainder = Math.max(0, roundUsd(edgeDebits - edgeLockedCredit));
  const availableAfterDebits = Math.max(0, roundUsd(edgeClaimableCredit - debitRemainder));
  const edge = {
    availableUsd: availableAfterDebits,
    lockedUsd: lockedAfterDebits,
    usableForMintUsd: roundUsd(availableAfterDebits + lockedAfterDebits),
    reservedUsd: roundUsd(amountFor("edge_reward", "reserved") + amountFor("edge_reward", "payment_received")),
    spentUsd: amountFor("edge_reward", "spent"),
    claimedUsd: amountFor("edge_reward", "paid")
  };
  return {
    referral,
    edge,
    totalAvailableUsd: edge.availableUsd,
    totalLockedUsd: edge.lockedUsd,
    totalUsableForMintUsd: edge.usableForMintUsd,
    totalReservedUsd: edge.reservedUsd,
    totalSpentUsd: edge.spentUsd,
    totalClaimRequestedUsd: roundUsd(amountFor("edge_reward", "claim_requested") + amountFor("edge_reward", "claim_authorized")),
    totalClaimedUsd: edge.claimedUsd
  };
}

async function syncClaimableBalanceCredits(userId: string) {
  return withDatabase(
    async (db) => {
      const activeId = await db.idName.findFirst({
        where: { userId, status: "active" },
        select: { name: true },
        orderBy: [{ isPrimary: "desc" }, { mintedAt: "desc" }]
      });
      if (activeId) {
        await db.rewardAllocation.updateMany({
          where: { userId, status: "locked_id_required" },
          data: { status: "approved", reviewedAt: new Date() }
        });
      }
      const rewards = await db.rewardAllocation.findMany({
          where: { userId, status: { in: [...CLAIMABLE_REWARD_STATUSES] }, rewardShareUsd: { gt: 0 } },
          select: { id: true, seasonCode: true, rewardShareUsd: true, level: true, badge: true, status: true }
      });

      await db.claimableBalanceLedger.updateMany({
        where: {
          userId,
          sourceType: "referral",
          status: { in: ["claimable", "reserved", "claim_requested"] }
        },
        data: { status: "source_inactive" }
      });

      for (const reward of rewards) {
        const ledgerStatus = reward.status === "locked_id_required" && !activeId ? "locked_id_required" : "claimable";
        await db.claimableBalanceLedger.upsert({
          where: { sourceType_sourceId_entryType: { sourceType: "edge_reward", sourceId: reward.id, entryType: "credit" } },
          update: {
            amountUsd: roundUsd(reward.rewardShareUsd),
            status: ledgerStatus,
            metadata: {
              seasonCode: reward.seasonCode,
              level: reward.level,
              badge: reward.badge,
              requiresId: ledgerStatus === "locked_id_required"
            } as JsonInput
          },
          create: {
            userId,
            sourceType: "edge_reward",
            sourceId: reward.id,
            entryType: "credit",
            status: ledgerStatus,
            amountUsd: roundUsd(reward.rewardShareUsd),
            metadata: {
              seasonCode: reward.seasonCode,
              level: reward.level,
              badge: reward.badge,
              requiresId: ledgerStatus === "locked_id_required"
            } as JsonInput
          }
        });
      }

      await db.claimableBalanceLedger.updateMany({
        where: {
          userId,
          sourceType: "edge_reward",
          entryType: "credit",
          sourceId: { notIn: rewards.map((reward) => reward.id) },
          status: { in: ["claimable", "locked_id_required"] }
        },
        data: { status: "source_inactive" }
      });
      return true;
    },
    async () => false
  );
}

export async function getClaimableBalanceSummary(userId?: string | null): Promise<ClaimableBalanceSummary> {
  if (!userId) return ZERO_SUMMARY;
  await syncClaimableBalanceCredits(userId);
  return withDatabase(
    async (db) => {
      const rows = await db.claimableBalanceLedger.findMany({
        where: { userId },
        select: { sourceType: true, entryType: true, status: true, amountUsd: true }
      });
      return summaryFromRows(rows);
    },
    async () => ZERO_SUMMARY
  );
}

export async function planClaimablePayment(userId: string, priceUsd: number, payMethod?: string | null): Promise<ClaimablePaymentPlan> {
  const price = roundUsd(priceUsd);
  const mode = normalizePayMode(payMethod);
  const summary = await getClaimableBalanceSummary(userId);
  const edgeUsableUsd = summary.edge.usableForMintUsd;
  let referralCreditUsd = 0;
  let edgeRewardCreditUsd = 0;

  if (mode === "referral") {
    throw new Error(walletError(mode, 0, price));
  } else if (mode === "edge") {
    if (edgeUsableUsd <= 0) throw new Error(walletError(mode, edgeUsableUsd, price));
    edgeRewardCreditUsd = Math.min(price, edgeUsableUsd);
  } else if (mode === "auto") {
    if (edgeUsableUsd <= 0) throw new Error(walletError(mode, edgeUsableUsd, price));
    edgeRewardCreditUsd = Math.min(price, edgeUsableUsd);
  }

  const creditUsd = roundUsd(referralCreditUsd + edgeRewardCreditUsd);
  const walletUsd = roundUsd(price - creditUsd);
  return {
    mode,
    priceUsd: price,
    referralCreditUsd,
    edgeRewardCreditUsd,
    walletUsd,
    creditUsd,
    requiresWalletTransaction: walletUsd > 0
  };
}

export async function releaseClaimableReservation(userId: string, referenceId: string) {
  return withDatabase(
    async (db) => {
      await db.claimableBalanceLedger.updateMany({
        where: { userId, referenceId, status: "reserved" },
        data: { status: "released" }
      });
      return true;
    },
    async () => false
  );
}

export async function reserveClaimablePayment(input: {
  userId: string;
  priceUsd: number;
  payMethod?: string | null;
  referenceId: string;
  metadata?: JsonInput;
  plan?: ClaimablePaymentPlan;
}) {
  await releaseClaimableReservation(input.userId, input.referenceId);
  const plan = input.plan ?? await planClaimablePayment(input.userId, input.priceUsd, input.payMethod);
  if (plan.creditUsd <= 0) return plan;

  return withDatabase(
    async (db) => {
      const creates = [
        ["edge_reward", plan.edgeRewardCreditUsd] as const
      ].filter(([, amount]) => amount > 0);
      for (const [sourceType, amount] of creates) {
        await db.claimableBalanceLedger.upsert({
          where: {
            sourceType_sourceId_entryType: {
              sourceType,
              sourceId: `${input.referenceId}:${sourceType}`,
              entryType: "reserve"
            }
          },
          update: {
            amountUsd: -roundUsd(amount),
            status: "reserved",
            referenceId: input.referenceId,
            metadata: { ...(input.metadata as Record<string, unknown> | undefined), plan } as JsonInput
          },
          create: {
            userId: input.userId,
            sourceType,
            sourceId: `${input.referenceId}:${sourceType}`,
            entryType: "reserve",
            status: "reserved",
            amountUsd: -roundUsd(amount),
            referenceId: input.referenceId,
            metadata: { ...(input.metadata as Record<string, unknown> | undefined), plan } as JsonInput
          }
        });
      }
      return plan;
    },
    async () => {
      throw new Error("Database is required to reserve claimable balance.");
    }
  );
}

export async function markClaimableReservationPaymentReceived(userId: string, referenceId: string, txHash: string) {
  return withDatabase(
    async (db) => {
      await db.claimableBalanceLedger.updateMany({
        where: { userId, referenceId, status: "reserved" },
        data: { status: "payment_received", txHash }
      });
      return true;
    },
    async () => false
  );
}

export async function finalizeClaimableSpend(userId: string, referenceId: string, txHash?: string | null) {
  return withDatabase(
    async (db) => {
      await db.claimableBalanceLedger.updateMany({
        where: { userId, referenceId, status: { in: ["reserved", "payment_received"] } },
        data: { status: "spent", txHash: txHash || undefined }
      });
      return true;
    },
    async () => false
  );
}

export async function finalizeClaimablePayout(input: {
  userId: string;
  referenceId: string;
  txHash: string;
}) {
  return withDatabase(
    async (db) => {
      const rows = await db.claimableBalanceLedger.findMany({
        where: {
          userId: input.userId,
          referenceId: input.referenceId,
          sourceType: "edge_reward",
          entryType: "claim",
          status: "claim_authorized"
        }
      });
      if (!rows.length) throw new Error("Claim authorization was not found or already completed.");
      const amountUsd = roundUsd(rows.reduce((sum, row) => sum + Math.abs(row.amountUsd), 0));
      await db.claimableBalanceLedger.updateMany({
        where: {
          userId: input.userId,
          referenceId: input.referenceId,
          sourceType: "edge_reward",
          entryType: "claim",
          status: "claim_authorized"
        },
        data: { status: "paid", txHash: input.txHash }
      });
      await db.user.update({
        where: { id: input.userId },
        data: { rewardEarnedUsd: { increment: amountUsd } }
      });
      return {
        referenceId: input.referenceId,
        amountUsd,
        status: "paid",
        txHash: input.txHash
      };
    },
    async () => {
      throw new Error("Database is required to complete claimable balance payout.");
    }
  );
}

export async function releaseClaimablePayoutAuthorization(input: {
  userId: string;
  referenceId: string;
}) {
  return withDatabase(
    async (db) => {
      await db.claimableBalanceLedger.updateMany({
        where: {
          userId: input.userId,
          referenceId: input.referenceId,
          sourceType: "edge_reward",
          entryType: "claim",
          status: "claim_authorized"
        },
        data: { status: "released" }
      });
      return true;
    },
    async () => false
  );
}

export async function requestClaimablePayout(input: {
  userId: string;
  amountUsd?: number | null;
  destination?: string | null;
}) {
  const summary = await getClaimableBalanceSummary(input.userId);
  const amount = roundUsd(input.amountUsd && input.amountUsd > 0 ? input.amountUsd : summary.edge.availableUsd);
  if (amount <= 0) throw new Error("No claimable balance is available.");
  if (amount > summary.edge.availableUsd) throw new Error("Claim amount exceeds available EdgeBoard balance.");

  const referenceId = `claim:${input.userId}:${Date.now()}`;
  const edgeAmount = Math.min(amount, summary.edge.availableUsd);

  return withDatabase(
    async (db) => {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        include: { ids: { where: { status: "active" }, orderBy: [{ isPrimary: "desc" }, { mintedAt: "desc" }] } }
      });
      const idName = user?.primaryIdName || user?.ids[0]?.name || null;
      if (!idName) throw new Error("Mint a .id before claiming EdgeBoard rewards to wallet. Locked EdgeBoard rewards can still be used to offset the .id mint.");
      for (const [sourceType, sourceAmount] of [
        ["edge_reward", edgeAmount] as const
      ]) {
        if (sourceAmount <= 0) continue;
        await db.claimableBalanceLedger.create({
          data: {
            userId: input.userId,
            sourceType,
            sourceId: `${referenceId}:${sourceType}`,
            entryType: "claim",
            status: "claim_authorized",
            amountUsd: -roundUsd(sourceAmount),
            referenceId,
            metadata: {
              destination: input.destination ?? null,
              idName
            } as JsonInput
          }
        });
      }
      return {
        referenceId,
        amountUsd: amount,
        status: "claim_authorized",
        destination: input.destination ?? null,
        idName
      };
    },
    async () => {
      throw new Error("Database is required to request a claimable balance payout.");
    }
  );
}

export async function listClaimablePayoutRequests() {
  return withDatabase(
    async (db) => {
      const rows = await db.claimableBalanceLedger.findMany({
        where: {
          sourceType: "edge_reward",
          entryType: "claim",
          status: { in: ["claim_requested", "claim_authorized", "paid"] }
        },
        include: {
          user: {
            select: {
              walletAddress: true,
              displayName: true,
              primaryIdName: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });
      const groups = new Map<string, {
        referenceId: string;
        identity: string;
        amountUsd: number;
        status: string;
        destination: string;
        sources: Set<string>;
        txHash: string;
        createdAt: Date;
      }>();

      for (const row of rows) {
        const referenceId = row.referenceId ?? row.sourceId;
        const metadata = metadataRecord(row.metadata);
        const current = groups.get(referenceId) ?? {
          referenceId,
          identity: resolveIdentityLabel(row.user),
          amountUsd: 0,
          status: row.status,
          destination: typeof metadata.destination === "string" ? metadata.destination : row.user.walletAddress,
          sources: new Set<string>(),
          txHash: row.txHash ?? "",
          createdAt: row.createdAt
        };
        current.amountUsd = roundUsd(current.amountUsd + Math.abs(row.amountUsd));
        current.sources.add("EdgeBoard");
        current.status = row.status === "claim_requested" || row.status === "claim_authorized" ? row.status : current.status;
        current.txHash = row.txHash ?? current.txHash;
        if (row.createdAt < current.createdAt) current.createdAt = row.createdAt;
        groups.set(referenceId, current);
      }

      return Array.from(groups.values()).map((row) => ({
        referenceId: row.referenceId,
        identity: row.identity,
        amount: `$${row.amountUsd.toFixed(2)}`,
        amountUsd: row.amountUsd,
        status: row.status,
        destination: row.destination,
        sources: Array.from(row.sources).join(" + "),
        txHash: row.txHash,
        createdAt: row.createdAt.toISOString()
      }));
    },
    async () => []
  );
}

export async function updateClaimablePayoutRequestAdmin(input: {
  referenceId: string;
  status: "paid" | "released";
  txHash?: string | null;
}) {
  return withDatabase(
    async (db) => {
      const rows = await db.claimableBalanceLedger.findMany({
        where: { referenceId: input.referenceId, sourceType: "edge_reward", entryType: "claim", status: { in: ["claim_requested", "claim_authorized"] } }
      });
      if (!rows.length) throw new Error("Claim request is not pending.");
      await db.claimableBalanceLedger.updateMany({
        where: { referenceId: input.referenceId, sourceType: "edge_reward", entryType: "claim", status: { in: ["claim_requested", "claim_authorized"] } },
        data: {
          status: input.status,
          txHash: input.status === "paid" ? input.txHash || undefined : undefined
        }
      });
      await db.adminAuditLog.create({
        data: {
          action: "update_claimable_payout",
          target: input.referenceId,
          metadata: {
            status: input.status,
            txHash: input.txHash ?? null,
            amountUsd: roundUsd(rows.reduce((sum, row) => sum + Math.abs(row.amountUsd), 0))
          } as JsonInput
        }
      });
      return { referenceId: input.referenceId, status: input.status };
    },
    async () => {
      throw new Error("Database is required to update claimable payout requests.");
    }
  );
}
