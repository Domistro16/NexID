import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import { publicMarketWhereClause } from "@/lib/services/marketVisibility";
import type { CreatedMarketSummary, Position, Receipt, ReceiptSide, Side } from "@/lib/types/nexid";

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberField(payload: Record<string, unknown>, key: string, fallback = 0) {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function toSide(value: unknown): Side | null {
  return value === "ride" || value === "fade" ? value : null;
}

function receiptSide(row: { side?: string | null; proof: string }): ReceiptSide {
  const side = toSide(row.side);
  if (side) return side;
  const proof = row.proof.toLowerCase();
  if (proof.includes("launch")) return "launch";
  if (proof.includes("settlement")) return "settlement";
  if (proof.includes("invalid")) return "invalid";
  return "proof";
}

function positionStatus(value?: string | null): Position["status"] {
  if (value === "won") return "resolved";
  if (value === "lost" || value === "invalid_refund") return "failed";
  if (value === "closed" || value === "resolved" || value === "failed" || value === "partial_fill" || value === "filled" || value === "pending") return value;
  return "live";
}

function titleLabel(value?: string | null) {
  if (!value) return "Pending";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function dashboardMarketStatus(value?: string | null) {
  if (value === "trading_live") return "Live";
  if (value === "ready_to_launch") return "Pending launch";
  if (value === "settled") return "Settled";
  if (value === "closed" || value === "result_proposed" || value === "disputed") return "Closed";
  if (value === "draft") return "Draft";
  return titleLabel(value);
}

function closeLabel(value?: Date | null) {
  if (!value) return "Open";
  const diff = value.getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const hours = Math.ceil(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  if (days > 0) return `${days}d ${rem}h`;
  return `${hours}h`;
}

function splitLabel(rideShares: number, fadeShares: number) {
  const total = rideShares + fadeShares;
  if (total <= 0) return "0 / 0";
  return `${Math.round((rideShares / total) * 100)} / ${Math.round((fadeShares / total) * 100)}`;
}

function entryPrice(notional: number, shares: number) {
  if (shares <= 0 || notional <= 0) return 1;
  return Math.max(0, Math.min(1, notional / shares));
}

export type PublicMarketActivity = {
  volumeUsdc: number;
  traderCount: number;
  riders: number;
  faders: number;
  native: {
    rideShares: number;
    fadeShares: number;
    collateralUsdc: number;
    launchStakeUsdc: number | null;
  };
  receipts: Array<{
    id: string;
    title: string;
    proof: string;
    identity: string;
    side: ReceiptSide;
    publicUrl: string;
    createdAt: string;
  }>;
  trades: Array<{
    id: string;
    identity: string;
    side: Side;
    amount: number;
    entryPrice: number | null;
    yesPrice: number | null;
    status: string;
    createdAt: string;
  }>;
};

export type PublicRecentTrade = {
  id: string;
  source: "native" | "routed";
  marketId: string;
  marketTitle: string;
  identity: string;
  side: Side;
  amount: number;
  yesPrice: number | null;
  status: string;
  createdAt: string;
};

export async function listRecentPublicTrades(limit = 12): Promise<PublicRecentTrade[]> {
  const take = Math.max(1, Math.min(40, limit));
  return withDatabase(
    async (db) => {
      const [nativePositions, routedReceipts] = await Promise.all([
        db.nativePosition.findMany({
          where: { side: { in: ["ride", "fade"] } },
          orderBy: { createdAt: "desc" },
          take
        }),
        db.marketReceipt.findMany({
          where: {
            proof: "Polymarket user-authenticated CLOB",
            side: { in: ["ride", "fade"] }
          },
          orderBy: { createdAt: "desc" },
          take
        })
      ]);
      const userIds = Array.from(new Set([
        ...nativePositions.flatMap((row) => row.userId ? [row.userId] : []),
        ...routedReceipts.flatMap((row) => row.userId ? [row.userId] : [])
      ]));
      const marketIds = Array.from(new Set([
        ...nativePositions.map((row) => row.marketId),
        ...routedReceipts.map((row) => row.marketId)
      ]));
      const [users, markets] = await Promise.all([
        userIds.length ? db.user.findMany({ where: { id: { in: userIds } } }) : Promise.resolve([]),
        marketIds.length ? db.market.findMany({ where: { id: { in: marketIds } } }) : Promise.resolve([])
      ]);
      const userById = new Map(users.map((user) => [user.id, user]));
      const marketById = new Map(markets.map((market) => [market.id, market]));

      const nativeRows = nativePositions.flatMap((row): PublicRecentTrade[] => {
        const side = toSide(row.side);
        if (!side) return [];
        const user = row.userId ? userById.get(row.userId) : null;
        const entry = entryPrice(row.notionalUsdc, row.shares);
        return [{
          id: `native:${row.id}`,
          source: "native",
          marketId: row.marketId,
          marketTitle: marketById.get(row.marketId)?.title ?? "Native NexMarket",
          identity: resolveIdentityLabel(user, row.walletAddress),
          side,
          amount: row.notionalUsdc,
          yesPrice: side === "ride" ? entry : 1 - entry,
          status: row.status,
          createdAt: row.createdAt.toISOString()
        }];
      });

      const routedRows = routedReceipts.flatMap((row): PublicRecentTrade[] => {
        const side = toSide(row.side);
        if (!side) return [];
        const payload = payloadRecord(row.payload);
        const user = row.userId ? userById.get(row.userId) : null;
        const entry = numberField(payload, "entryPrice") || null;
        return [{
          id: `routed:${row.id}`,
          source: "routed",
          marketId: row.marketId,
          marketTitle: marketById.get(row.marketId)?.title ?? row.title.replace(/^(Rode|Faded)\s+/i, ""),
          identity: resolveIdentityLabel(user, row.walletAddress ?? undefined),
          side,
          amount: numberField(payload, "amount"),
          yesPrice: entry === null ? null : side === "ride" ? entry : 1 - entry,
          status: String(payload.fillStatus ?? "submitted"),
          createdAt: row.createdAt.toISOString()
        }];
      });

      return [...nativeRows, ...routedRows]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, take);
    },
    async () => []
  );
}

export async function listCurrentMarketPositions(userId?: string): Promise<Position[]> {
  if (!userId) return [];
  return withDatabase(
    async (db) => {
      const [nativePositions, routedReceipts] = await Promise.all([
        db.nativePosition.findMany({
          where: { userId, side: { in: ["ride", "fade"] } },
          orderBy: { createdAt: "desc" },
          take: 50
        }),
        db.marketReceipt.findMany({
          where: {
            userId,
            proof: "Polymarket user-authenticated CLOB",
            side: { in: ["ride", "fade"] }
          },
          orderBy: { createdAt: "desc" },
          take: 50
        })
      ]);
      const marketIds = Array.from(new Set([
        ...nativePositions.map((row) => row.marketId),
        ...routedReceipts.map((row) => row.marketId)
      ]));
      const markets = marketIds.length
        ? await db.market.findMany({ where: { id: { in: marketIds } } })
        : [];
      const marketById = new Map(markets.map((market) => [market.id, market]));

      const nativeRows = nativePositions.flatMap((row): Position[] => {
        const side = toSide(row.side);
        if (!side) return [];
        const market = marketById.get(row.marketId);
        return [{
          id: row.id,
          source: "native",
          userId: row.userId,
          narrativeId: row.marketId,
          marketId: row.marketId,
          narrativeName: market?.title ?? "Native NexMarket",
          side,
          orderType: "market",
          amount: row.notionalUsdc,
          entryPrice: entryPrice(row.notionalUsdc, row.shares),
          requestedWalletAddress: row.walletAddress,
          executionMode: "native_onchain",
          marketQualityScore: null,
          outcomeToken: null,
          executionId: row.txHash,
          proof: "Native onchain trade",
          fillStatus: row.status,
          status: positionStatus(row.status),
          settlementSource: market?.sourceUrl ?? null,
          createdAt: row.createdAt.toISOString()
        }];
      });

      const routedRows = routedReceipts.flatMap((row): Position[] => {
        const side = toSide(row.side);
        if (!side) return [];
        const payload = payloadRecord(row.payload);
        const market = marketById.get(row.marketId);
        return [{
          id: `market-receipt:${row.id}`,
          source: "polymarket_route",
          userId: row.userId,
          narrativeId: row.marketId,
          marketId: row.marketId,
          narrativeName: market?.title ?? row.title.replace(/^(Rode|Faded)\s+/i, ""),
          side,
          orderType: stringField(payload, "orderType") === "limit" ? "limit" : "market",
          amount: numberField(payload, "amount"),
          entryPrice: numberField(payload, "entryPrice", 0),
          requestedWalletAddress: row.walletAddress,
          executionMode: "polymarket_route",
          marketQualityScore: null,
          outcomeToken: stringField(payload, "outcomeToken"),
          executionId: stringField(payload, "executionId"),
          proof: row.proof,
          fillStatus: stringField(payload, "fillStatus"),
          status: positionStatus(stringField(payload, "fillStatus")),
          settlementSource: market?.sourceUrl ?? null,
          createdAt: row.createdAt.toISOString()
        }];
      });

      return [...nativeRows, ...routedRows]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 50);
    },
    async () => []
  );
}

export async function listCurrentMarketReceipts(userId?: string): Promise<Receipt[]> {
  if (!userId) return [];
  return withDatabase(
    async (db) => {
      const rows = await db.marketReceipt.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 75
      });
      const marketIds = Array.from(new Set(rows.map((row) => row.marketId)));
      const [user, markets] = await Promise.all([
        db.user.findUnique({ where: { id: userId } }),
        marketIds.length
          ? db.market.findMany({ where: { id: { in: marketIds } } })
          : Promise.resolve([])
      ]);
      const nativePositions = await db.nativePosition.findMany({
        where: { userId, marketId: { in: marketIds } },
        orderBy: { createdAt: "desc" },
        take: 100
      });
      const marketById = new Map(markets.map((market) => [market.id, market]));
      const nativePositionByTx = new Map(nativePositions.flatMap((position) => position.txHash ? [[position.txHash.toLowerCase(), position] as const] : []));

      return rows.map((row): Receipt => {
        const payload = payloadRecord(row.payload);
        const market = marketById.get(row.marketId);
        const txHash = stringField(payload, "txHash")?.toLowerCase();
        const nativePosition = txHash ? nativePositionByTx.get(txHash) : null;
        const side = receiptSide(row);
        const isRoutedTrade = row.proof === "Polymarket user-authenticated CLOB";
        const positionId = nativePosition?.id ?? (isRoutedTrade ? `market-receipt:${row.id}` : `market:${row.marketId}:${side}`);
        return {
          id: row.id,
          source: "market_receipt",
          positionId,
          narrativeName: market?.title ?? row.title.replace(/^(Rode|Faded)\s+/i, ""),
          side,
          returnPct: numberField(payload, "returnPct"),
          proofLevel: row.proof,
          edgePoints: numberField(payload, "points"),
          edgeScore: undefined,
          scoreBreakdown: null,
          rank: side === "launch" ? "Launch proof" : side === "settlement" ? "Settlement proof" : "Market proof",
          identity: resolveIdentityLabel(user, row.walletAddress ?? "tracked"),
          publicUrl: row.publicUrl ?? `/market/${row.marketId}`,
          status: market?.status ?? "ready",
          cardAsset: null,
          settlementSource: market?.sourceUrl ?? null,
          settledAt: null
        };
      });
    },
    async () => []
  );
}

export async function listCurrentCreatedMarkets(userId?: string): Promise<CreatedMarketSummary[]> {
  if (!userId) return [];
  return withDatabase(
    async (db) => {
      const markets = await db.market.findMany({
        where: { creatorUserId: userId, ...publicMarketWhereClause() },
        orderBy: { createdAt: "desc" },
        take: 24
      });
      const marketIds = markets.map((market) => market.id);
      if (!marketIds.length) return [];

      const [positions, trades, feeRows, stakes, resolutions] = await Promise.all([
        db.nativePosition.findMany({ where: { marketId: { in: marketIds } } }),
        db.nativeTrade.findMany({ where: { marketId: { in: marketIds } } }),
        db.creatorFeeLedger.findMany({ where: { marketId: { in: marketIds } } }),
        db.launchStake.findMany({ where: { marketId: { in: marketIds } } }),
        db.marketResolution.findMany({ where: { marketId: { in: marketIds } }, orderBy: { createdAt: "desc" } })
      ]);

      const positionsByMarket = new Map<string, typeof positions>();
      for (const position of positions) {
        const rows = positionsByMarket.get(position.marketId) ?? [];
        rows.push(position);
        positionsByMarket.set(position.marketId, rows);
      }

      const tradesByMarket = new Map<string, typeof trades>();
      for (const trade of trades) {
        const rows = tradesByMarket.get(trade.marketId) ?? [];
        rows.push(trade);
        tradesByMarket.set(trade.marketId, rows);
      }

      const feesByMarket = new Map<string, typeof feeRows>();
      for (const row of feeRows) {
        const rows = feesByMarket.get(row.marketId) ?? [];
        rows.push(row);
        feesByMarket.set(row.marketId, rows);
      }

      const stakeByMarket = new Map(stakes.map((stake) => [stake.marketId, stake]));
      const resolutionByMarket = new Map<string, (typeof resolutions)[number]>();
      for (const resolution of resolutions) {
        if (!resolutionByMarket.has(resolution.marketId)) resolutionByMarket.set(resolution.marketId, resolution);
      }

      return markets.map((market): CreatedMarketSummary => {
        const marketPositions = positionsByMarket.get(market.id) ?? [];
        const marketTrades = tradesByMarket.get(market.id) ?? [];
        const marketFees = feesByMarket.get(market.id) ?? [];
        const feeVolume = marketFees.reduce((sum, row) => sum + row.volumeUsdc, 0);
        const tradeVolume = marketTrades.reduce((sum, row) => sum + row.notionalUsdc, 0);
        const creatorFee = marketFees.reduce((sum, row) => sum + row.creatorFeeUsdc, 0);
        const traders = new Set([
          ...marketPositions.map((row) => row.walletAddress.toLowerCase()),
          ...marketTrades.map((row) => row.walletAddress.toLowerCase())
        ]);
        const rideShares = marketPositions.filter((row) => row.side === "ride").reduce((sum, row) => sum + row.shares, 0);
        const fadeShares = marketPositions.filter((row) => row.side === "fade").reduce((sum, row) => sum + row.shares, 0);
        const stake = stakeByMarket.get(market.id);
        const resolution = resolutionByMarket.get(market.id);
        const finalOutcome = resolution?.finalOutcome ? titleLabel(resolution.finalOutcome) : null;
        const settlement = finalOutcome
          ? `Resolved ${finalOutcome}`
          : resolution?.status && resolution.status !== "pending"
            ? titleLabel(resolution.status)
            : market.status === "closed" || market.status === "result_proposed" || market.status === "disputed"
              ? "Pending settlement"
              : "Pending";

        return {
          id: market.id,
          title: market.title,
          category: titleLabel(market.arena),
          status: dashboardMarketStatus(market.status),
          volume: feeVolume || tradeVolume,
          traders: traders.size,
          split: splitLabel(rideShares, fadeShares),
          creatorFee,
          claimable: creatorFee,
          bond: stake?.returnedAt ? "Returned" : stake?.slashedAt ? "Slashed" : stake ? `$${stake.totalUsdc} ${stake.status}` : "Not staked",
          close: closeLabel(market.closeTime),
          settlement,
          publicUrl: `/market/${market.id}`
        };
      });
    },
    async () => []
  );
}

export async function getPublicMarketActivity(marketId: string): Promise<PublicMarketActivity> {
  return withDatabase(
    async (db) => {
      const [nativePositions, nativeTrades, marketReceipts, launchStake] = await Promise.all([
        db.nativePosition.findMany({
          where: { marketId },
          orderBy: { createdAt: "desc" },
          take: 100
        }),
        db.nativeTrade.findMany({
          where: { marketId },
          orderBy: { createdAt: "desc" },
          take: 100
        }),
        db.marketReceipt.findMany({
          where: { marketId },
          orderBy: { createdAt: "desc" },
          take: 100
        }),
        db.launchStake.findUnique({
          where: { marketId }
        })
      ]);
      const userIds = Array.from(new Set([
        ...nativePositions.flatMap((row) => row.userId ? [row.userId] : []),
        ...marketReceipts.flatMap((row) => row.userId ? [row.userId] : [])
      ]));
      const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } } }) : [];
      const userById = new Map(users.map((user) => [user.id, user]));

      const receiptRows = marketReceipts.map((row) => {
        const user = row.userId ? userById.get(row.userId) : null;
        return {
          id: row.id,
          title: row.title,
          proof: row.proof,
          identity: resolveIdentityLabel(user, row.walletAddress ?? undefined),
          side: receiptSide(row),
          publicUrl: row.publicUrl ?? `/market/${row.marketId}`,
          createdAt: row.createdAt.toISOString()
        };
      });

      const positionRows = nativePositions.flatMap((row) => {
        const side = toSide(row.side);
        if (!side) return [];
        const user = row.userId ? userById.get(row.userId) : null;
        const sideEntryPrice = entryPrice(row.notionalUsdc, row.shares);
        return [{
          id: row.id,
          identity: resolveIdentityLabel(user, row.walletAddress),
          side,
          amount: row.notionalUsdc,
          entryPrice: sideEntryPrice,
          yesPrice: side === "ride" ? sideEntryPrice : 1 - sideEntryPrice,
          status: row.status,
          createdAt: row.createdAt.toISOString()
        }];
      });

      const routedTradeRows = marketReceipts.flatMap((row) => {
        const side = toSide(row.side);
        if (!side || row.proof !== "Polymarket user-authenticated CLOB") return [];
        const payload = payloadRecord(row.payload);
        const user = row.userId ? userById.get(row.userId) : null;
        const sideEntryPrice = numberField(payload, "entryPrice") || null;
        return [{
          id: `receipt:${row.id}`,
          identity: resolveIdentityLabel(user, row.walletAddress ?? undefined),
          side,
          amount: numberField(payload, "amount"),
          entryPrice: sideEntryPrice,
          yesPrice: sideEntryPrice === null ? null : side === "ride" ? sideEntryPrice : 1 - sideEntryPrice,
          status: String(payload.fillStatus ?? "submitted"),
          createdAt: row.createdAt.toISOString()
        }];
      });

      const trades = [...positionRows, ...routedTradeRows]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 50);
      const uniqueTraders = new Set(trades.map((row) => row.identity));
      const nativeVolume = nativeTrades.reduce((sum, row) => sum + row.notionalUsdc, 0);
      const routedVolume = routedTradeRows.reduce((sum, row) => sum + row.amount, 0);
      const rideShares = nativePositions
        .filter((row) => row.side === "ride")
        .reduce((sum, row) => sum + row.shares, 0);
      const fadeShares = nativePositions
        .filter((row) => row.side === "fade")
        .reduce((sum, row) => sum + row.shares, 0);

      return {
        volumeUsdc: nativeVolume + routedVolume,
        traderCount: uniqueTraders.size,
        riders: trades.filter((row) => row.side === "ride").length,
        faders: trades.filter((row) => row.side === "fade").length,
        native: {
          rideShares,
          fadeShares,
          collateralUsdc: nativeVolume,
          launchStakeUsdc: launchStake?.totalUsdc ?? null
        },
        receipts: receiptRows.slice(0, 50),
        trades
      };
    },
    async () => ({
      volumeUsdc: 0,
      traderCount: 0,
      riders: 0,
      faders: 0,
      native: {
        rideShares: 0,
        fadeShares: 0,
        collateralUsdc: 0,
        launchStakeUsdc: null
      },
      receipts: [],
      trades: []
    })
  );
}
