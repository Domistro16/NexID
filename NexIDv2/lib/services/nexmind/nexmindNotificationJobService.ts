import { withDatabase } from "@/lib/server/db";
import { bankrFeatureEnabled } from "@/lib/services/bankr/bankrConfig";
import { createCreatorNotification } from "@/lib/services/nexmind/nexmindNotificationService";

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function recentlyNotified(input: { marketId: string; type: string; sinceHours?: number }) {
  return withDatabase(
    async (db) => {
      const count = await db.creatorNotification.count({
        where: {
          marketId: input.marketId,
          type: input.type,
          createdAt: { gte: hoursAgo(input.sinceHours ?? 24) }
        }
      });
      return count > 0;
    },
    async () => false
  );
}

async function closeReminders(limit: number) {
  const markets = await withDatabase(
    async (db) => db.market.findMany({
      where: {
        origin: "native",
        status: { in: ["live_pending_open", "trading_live"] },
        closeTime: {
          gte: new Date(),
          lte: hoursFromNow(24)
        }
      },
      orderBy: { closeTime: "asc" },
      take: limit,
      select: {
        id: true,
        title: true,
        closeTime: true,
        creatorUserId: true,
        creatorWallet: true
      }
    }),
    async () => []
  );
  const sent = [];
  for (const market of markets) {
    if (await recentlyNotified({ marketId: market.id, type: "market_close_reminder", sinceHours: 30 })) continue;
    sent.push(await createCreatorNotification({
      userId: market.creatorUserId,
      walletAddress: market.creatorWallet,
      marketId: market.id,
      type: "market_close_reminder",
      title: "Market close reminder",
      body: `${market.title} closes ${market.closeTime?.toISOString() ?? "soon"}. Make sure the source and rules are still clean.`,
      metadata: { closeTime: market.closeTime?.toISOString() ?? null }
    }));
  }
  return sent.length;
}

async function resolutionRequests(limit: number) {
  const markets = await withDatabase(
    async (db) => db.market.findMany({
      where: {
        origin: "native",
        status: "closed",
        closeTime: { lte: new Date() }
      },
      orderBy: { closeTime: "asc" },
      take: limit,
      select: {
        id: true,
        title: true,
        creatorUserId: true,
        creatorWallet: true
      }
    }),
    async () => []
  );
  const sent = [];
  for (const market of markets) {
    const hasResolution = await withDatabase(
      async (db) => Boolean(await db.marketResolution.findFirst({ where: { marketId: market.id } })),
      async () => false
    );
    if (hasResolution || await recentlyNotified({ marketId: market.id, type: "resolution_request", sinceHours: 24 })) continue;
    sent.push(await createCreatorNotification({
      userId: market.creatorUserId,
      walletAddress: market.creatorWallet,
      marketId: market.id,
      type: "resolution_request",
      title: "Resolution needed",
      body: `${market.title} is closed and needs result verification.`,
      metadata: { status: "closed" }
    }));
  }
  return sent.length;
}

async function settlementReminders(limit: number) {
  const markets = await withDatabase(
    async (db) => db.market.findMany({
      where: {
        origin: "native",
        status: { in: ["result_proposed", "disputed"] }
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        creatorUserId: true,
        creatorWallet: true
      }
    }),
    async () => []
  );
  const sent = [];
  for (const market of markets) {
    if (await recentlyNotified({ marketId: market.id, type: "settlement_reminder", sinceHours: 24 })) continue;
    sent.push(await createCreatorNotification({
      userId: market.creatorUserId,
      walletAddress: market.creatorWallet,
      marketId: market.id,
      type: "settlement_reminder",
      title: "Settlement reminder",
      body: `${market.title} is in ${market.status.replace(/_/g, " ")}. Check the ProofFlow evidence state and finalize when the challenge window is complete.`,
      metadata: { status: market.status }
    }));
  }
  return sent.length;
}

async function creatorEarnings(limit: number) {
  const rows = await withDatabase(
    async (db) => db.creatorFeeLedger.findMany({
      where: { createdAt: { gte: hoursAgo(24) }, creatorFeeUsdc: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      take: limit * 5,
      select: {
        marketId: true,
        creatorWallet: true,
        creatorFeeUsdc: true,
        volumeUsdc: true
      }
    }),
    async () => []
  );
  const grouped = new Map<string, { marketId: string; creatorWallet: string; creatorFeeUsdc: number; volumeUsdc: number }>();
  for (const row of rows) {
    const key = `${row.marketId}:${row.creatorWallet.toLowerCase()}`;
    const current = grouped.get(key) ?? { marketId: row.marketId, creatorWallet: row.creatorWallet, creatorFeeUsdc: 0, volumeUsdc: 0 };
    current.creatorFeeUsdc += row.creatorFeeUsdc;
    current.volumeUsdc += row.volumeUsdc;
    grouped.set(key, current);
  }
  let sent = 0;
  for (const row of Array.from(grouped.values()).slice(0, limit)) {
    if (await recentlyNotified({ marketId: row.marketId, type: "creator_earnings", sinceHours: 24 })) continue;
    const market = await withDatabase(
      async (db) => db.market.findUnique({ where: { id: row.marketId }, select: { title: true, creatorUserId: true } }),
      async () => null
    );
    await createCreatorNotification({
      userId: market?.creatorUserId ?? null,
      walletAddress: row.creatorWallet,
      marketId: row.marketId,
      type: "creator_earnings",
      title: "Creator earnings updated",
      body: `${market?.title ?? "Your market"} generated $${row.creatorFeeUsdc.toFixed(2)} creator fees from $${row.volumeUsdc.toFixed(2)} volume in the last 24 hours.`,
      metadata: {
        creatorFeeUsdc: row.creatorFeeUsdc,
        volumeUsdc: row.volumeUsdc
      }
    });
    sent += 1;
  }
  return sent;
}

export async function runCreatorNotificationJob(input: { limit?: number; force?: boolean } = {}) {
  if (!bankrFeatureEnabled("notifications") && !input.force) {
    return { ok: true, skipped: true, reason: "Bankr notification automation is disabled." };
  }
  const limit = input.limit ?? 20;
  const [closeReminderCount, resolutionRequestCount, settlementReminderCount, creatorEarningsCount] = await Promise.all([
    closeReminders(limit),
    resolutionRequests(limit),
    settlementReminders(limit),
    creatorEarnings(limit)
  ]);
  return {
    ok: true,
    skipped: false,
    closeReminderCount,
    resolutionRequestCount,
    settlementReminderCount,
    creatorEarningsCount
  };
}
