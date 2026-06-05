import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";

export const internalNav = [
  ["Positions", "/internal/positions"],
  ["Native resolution", "/internal/native-resolution"],
  ["Receipts", "/internal/receipts"],
  ["Points", "/internal/points"],
  ["Rewards", "/internal/rewards"],
  ["Referrals", "/internal/referrals"]
] as const;

function identity(user?: { primaryIdName: string | null; displayName?: string | null; walletAddress: string } | null) {
  return resolveIdentityLabel(user);
}

export async function getReceiptRows() {
  return withDatabase(
    async (db) => {
      const receipts = await db.marketReceipt.findMany({
        orderBy: { createdAt: "desc" },
        take: 50
      });
      const userIds = Array.from(new Set(receipts.flatMap((receipt) => receipt.userId ? [receipt.userId] : [])));
      const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } } }) : [];
      const usersById = new Map(users.map((user) => [user.id, user]));
      return receipts.map((receipt) => ({
        id: receipt.id,
        identity: identity(receipt.userId ? usersById.get(receipt.userId) : null),
        thesis: receipt.title,
        result: receipt.proof,
        points: receipt.userId ? usersById.get(receipt.userId)?.pointsTotal ?? 0 : 0,
        rank: receipt.side ? String(receipt.side) : "proof",
        proofLevel: receipt.proof,
        reviewStatus: "saved"
      }));
    },
    async () => []
  );
}

export async function getPositionRows() {
  return withDatabase(
    async (db) => {
      const [nativePositions, routedReceipts] = await Promise.all([
        db.nativePosition.findMany({
          where: { side: { in: ["ride", "fade"] } },
          orderBy: { createdAt: "desc" },
          take: 50
        }),
        db.marketReceipt.findMany({
          where: { proof: "Polymarket user-authenticated CLOB", side: { in: ["ride", "fade"] } },
          orderBy: { createdAt: "desc" },
          take: 50
        })
      ]);
      const userIds = Array.from(new Set([
        ...nativePositions.flatMap((position) => position.userId ? [position.userId] : []),
        ...routedReceipts.flatMap((receipt) => receipt.userId ? [receipt.userId] : [])
      ]));
      const marketIds = Array.from(new Set([
        ...nativePositions.map((position) => position.marketId),
        ...routedReceipts.map((receipt) => receipt.marketId)
      ]));
      const [users, markets, receipts] = await Promise.all([
        userIds.length ? db.user.findMany({ where: { id: { in: userIds } } }) : Promise.resolve([]),
        marketIds.length ? db.market.findMany({ where: { id: { in: marketIds } } }) : Promise.resolve([]),
        marketIds.length ? db.marketReceipt.findMany({ where: { marketId: { in: marketIds } } }) : Promise.resolve([])
      ]);
      const usersById = new Map(users.map((user) => [user.id, user]));
      const marketsById = new Map(markets.map((market) => [market.id, market]));
      const receiptKeys = new Set(receipts.map((receipt) => `${receipt.marketId}:${receipt.userId ?? ""}:${receipt.side ?? ""}`));
      const nativeRows = nativePositions.map((position) => {
        const market = marketsById.get(position.marketId);
        const receiptKey = `${position.marketId}:${position.userId ?? ""}:${position.side}`;
        return {
          id: position.id,
          createdAt: position.createdAt,
          identity: identity(position.userId ? usersById.get(position.userId) : null),
          thesis: `${position.side === "ride" ? "Ride" : "Fade"} ${market?.title ?? "native market"}`,
          status: position.status,
          entry: `$${position.notionalUsdc.toFixed(2)} / ${position.shares.toFixed(2)} shares`,
          settlement: market?.status ?? "market tracked",
          executionMode: "native market",
          receipt: receiptKeys.has(receiptKey) ? "saved" : "pending",
          source: market?.sourceUrl ?? position.txHash ?? ""
        };
      });
      const routedRows = routedReceipts.map((receipt) => {
        const market = marketsById.get(receipt.marketId);
        return {
          id: `market-receipt:${receipt.id}`,
          createdAt: receipt.createdAt,
          identity: identity(receipt.userId ? usersById.get(receipt.userId) : null),
          thesis: receipt.title,
          status: "submitted",
          entry: "Polymarket route",
          settlement: market?.status ?? "market tracked",
          executionMode: "polymarket route",
          receipt: "saved",
          source: market?.sourceUrl ?? ""
        };
      });
      return [...nativeRows, ...routedRows]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 50)
        .map(({ createdAt, ...row }) => row);
    },
    async () => []
  );
}

export async function getNativeResolutionRows() {
  return withDatabase(
    async (db) => {
      const markets = await db.market.findMany({
        where: { origin: "native" },
        orderBy: [{ closeTime: "asc" }, { updatedAt: "desc" }],
        take: 50
      });
      const resolutions = await db.marketResolution.findMany({
        where: { marketId: { in: markets.map((market) => market.id) } },
        orderBy: { updatedAt: "desc" }
      });
      const latest = new Map<string, (typeof resolutions)[number]>();
      for (const resolution of resolutions) {
        if (!latest.has(resolution.marketId)) latest.set(resolution.marketId, resolution);
      }
      return markets.map((market) => {
        const resolution = latest.get(market.id);
        const close = market.closeTime ? market.closeTime.toISOString().slice(0, 16).replace("T", " ") : "unset";
        return {
          id: market.id,
          title: market.title,
          status: market.status,
          close,
          outcome: resolution?.proposedOutcome ?? "",
          resolution: resolution?.status ?? "not queued",
          verification: resolution?.verificationStatus ?? "pending",
          confidence: resolution?.confidence == null ? "" : `${Math.round(resolution.confidence * 100)}%`,
          mode: resolution?.settlementMode ?? resolution?.resolutionMode ?? "",
          assertion: resolution?.assertionId ? `legacy:${resolution.assertionId}` : "",
          evidence: resolution?.evidenceHash ?? "",
          claim: resolution?.assertionClaim ?? "",
          deadline: (resolution?.challengeWindowEndsAt ?? resolution?.assertionDeadline)?.toISOString().slice(0, 16).replace("T", " ") ?? "",
          contract: market.contractAddress ?? "",
          source: market.sourceUrl ?? "",
          error: resolution?.lastError ?? ""
        };
      });
    },
    async () => []
  );
}

export async function getPointsRows() {
  return withDatabase(
    async (db) => {
      const users = await db.user.findMany({
        include: {
          pointsEvents: { orderBy: { createdAt: "desc" }, take: 1 }
        },
        orderBy: { pointsTotal: "desc" },
        take: 50
      });
      const receiptCounts = await db.marketReceipt.groupBy({
        by: ["userId"],
        where: { userId: { in: users.map((user) => user.id) } },
        _count: { _all: true }
      });
      const receiptsByUser = new Map(receiptCounts.flatMap((row) => row.userId ? [[row.userId, row._count._all] as const] : []));
      return users.map((user, index) => ({
        userId: user.id,
        identity: identity(user),
        latestReason: user.pointsEvents[0]?.reason ?? "",
        total: user.pointsTotal,
        receipts: receiptsByUser.get(user.id) ?? 0,
        rank: `#${index + 1}`,
        abuseFlag: "Review in anti-gaming signals"
      }));
    },
    async () => []
  );
}

export async function getReferralRows() {
  return withDatabase(
    async (db) => {
      const referrals = await db.referral.findMany({
        include: { referrer: true, referred: true },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      return referrals.map((referral) => ({
        id: referral.id,
        referrer: referral.referrer ? identity(referral.referrer) : `${referral.referrerIdName}.id`,
        referred: referral.referred ? identity(referral.referred) : "",
        clicks: referral.clicks,
        signups: referral.signups,
        mints: referral.mintName ? 1 : 0,
        pending: `$${referral.rewardAmount.toFixed(2)}`,
        status: referral.status,
        risk: referral.riskFlag ?? "Normal"
      }));
    },
    async () => []
  );
}
