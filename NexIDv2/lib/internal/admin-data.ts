import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";

export const internalNav = [
  ["Narrative mapping", "/internal/narrative-mapping"],
  ["Quality review", "/internal/quality-review"],
  ["Positions", "/internal/positions"],
  ["Receipts", "/internal/receipts"],
  ["Points", "/internal/points"],
  ["Rewards", "/internal/rewards"],
  ["Referrals", "/internal/referrals"]
] as const;

function identity(user?: { primaryIdName: string | null; displayName?: string | null; walletAddress: string } | null) {
  return resolveIdentityLabel(user);
}

export async function getMappingRows() {
  return withDatabase(
    async (db) => {
      const narratives = await db.narrative.findMany({
        include: { markets: { orderBy: { qualityScore: "desc" }, take: 1 } },
        orderBy: [{ tradable: "desc" }, { heat: "desc" }]
      });
      return narratives.map((narrative) => {
        const market = narrative.markets[0];
        return {
          id: narrative.id,
          name: narrative.name,
          tag: narrative.tag,
          quality: narrative.quality,
          heat: narrative.heat,
          liquidity: `$${Math.round(narrative.liquidity).toLocaleString()}`,
          spread: `${narrative.spread}%`,
          bestMarketId: narrative.bestMarketId ?? market?.id ?? "",
          sideMap: market ? JSON.stringify(market.sideMap) : "",
          status: narrative.tradable ? "Tradable" : "No-trade",
          fallbackReason: narrative.fallbackReason ?? ""
        };
      });
    },
    async () => []
  );
}

export async function getQualityRows() {
  return withDatabase(
    async (db) => {
      const narratives = await db.narrative.findMany({
        include: { markets: { orderBy: { updatedAt: "desc" }, take: 1 } },
        orderBy: [{ tradable: "asc" }, { spread: "desc" }, { liquidity: "asc" }]
      });
      return narratives.map((narrative) => {
        const market = narrative.markets[0];
        return {
          id: narrative.id,
          name: narrative.name,
          dataFreshness: market ? market.updatedAt.toISOString().slice(0, 16).replace("T", " ") : "unmapped",
          marketQuality: narrative.quality,
          noTradeReason: narrative.fallbackReason ?? "",
          risk: narrative.liquidity < 200000 ? "Low liquidity" : narrative.spread > 5 ? "Wide spread" : narrative.tradable ? "Normal" : "Blocked",
          tradable: narrative.tradable ? "yes" : "no"
        };
      });
    },
    async () => []
  );
}

export async function getReceiptRows() {
  return withDatabase(
    async (db) => {
      const receipts = await db.receipt.findMany({
        include: { user: true, position: { include: { narrative: true } } },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      return receipts.map((receipt) => ({
        id: receipt.id,
        identity: identity(receipt.user),
        thesis: `${receipt.position.side === "ride" ? "Rode" : "Faded"} ${receipt.position.narrative.name}`,
        result: `+${receipt.returnPct}%`,
        points: receipt.edgePoints,
        rank: receipt.rank,
        proofLevel: receipt.proofLevel,
        reviewStatus: receipt.status
      }));
    },
    async () => []
  );
}

export async function getPositionRows() {
  return withDatabase(
    async (db) => {
      const positions = await db.position.findMany({
        include: { user: true, narrative: true, receipt: true },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      return positions.map((position) => ({
        id: position.id,
        identity: identity(position.user),
        thesis: `${position.side === "ride" ? "Ride" : "Fade"} ${position.narrative.name}`,
        status: position.status,
        entry: `${Math.round(position.entryPrice * 100)}c / $${position.amount.toFixed(2)}`,
        settlement: position.settlementPrice == null ? "unset" : `${Math.round(position.settlementPrice * 100)}c`,
        executionMode: position.executionMode,
        receipt: position.receipt ? "generated" : "none",
        source: position.settlementSource ?? ""
      }));
    },
    async () => []
  );
}

export async function getPointsRows() {
  return withDatabase(
    async (db) => {
      const users = await db.user.findMany({
        include: {
          receipts: true,
          pointsEvents: { orderBy: { createdAt: "desc" }, take: 1 }
        },
        orderBy: { pointsTotal: "desc" },
        take: 50
      });
      return users.map((user, index) => ({
        userId: user.id,
        identity: identity(user),
        latestReason: user.pointsEvents[0]?.reason ?? "",
        total: user.pointsTotal,
        receipts: user.receipts.length,
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
