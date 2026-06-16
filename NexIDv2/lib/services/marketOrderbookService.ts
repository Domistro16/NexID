import { getOrderBook } from "@/lib/services/polymarketClient";
import { requireDatabase, withDatabase } from "@/lib/server/db";
import type {
  MarketOrderbookLevel,
  MarketOrderbookOutcome,
  MarketOrderbookSide,
  PublicMarketOrderbook
} from "@/lib/types/orderbook";

type MarketSnapshot = {
  id: string;
  origin: string;
  status: string;
  title: string;
  polymarketClobTokenIds: unknown;
  updatedAt: Date;
};

type OrderSnapshot = {
  side: string;
  direction: string;
  price: number;
  remainingUsdc: number;
  shareEstimate: number;
};

type Snapshot = {
  market: MarketSnapshot;
  orders: OrderSnapshot[];
};

function clampPrice(value: number) {
  return Math.max(0.01, Math.min(0.99, value));
}

function rounded(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function priceKey(value: number) {
  return rounded(clampPrice(value), 3);
}

function priceCents(value: number) {
  return Math.round(clampPrice(value) * 100);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function tokenList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function emptySide(outcome: MarketOrderbookOutcome, label: string): MarketOrderbookSide {
  return {
    outcome,
    label,
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    spread: null,
    midpoint: null
  };
}

function sideWithLevels(outcome: MarketOrderbookOutcome, label: string, bids: MarketOrderbookLevel[], asks: MarketOrderbookLevel[]): MarketOrderbookSide {
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread = bestBid !== null && bestAsk !== null ? Math.max(0, rounded(bestAsk - bestBid, 3)) : null;
  const midpoint = bestBid !== null && bestAsk !== null ? rounded((bestBid + bestAsk) / 2, 3) : null;
  return {
    outcome,
    label,
    bids,
    asks,
    bestBid,
    bestAsk,
    spread,
    midpoint
  };
}

function withCumulative(levels: Array<Omit<MarketOrderbookLevel, "cumulativeUsdc" | "depthPct">>) {
  let running = 0;
  const cumulative = levels.map((level) => {
    running += level.sizeUsdc;
    return { ...level, cumulativeUsdc: rounded(running) };
  });
  const max = Math.max(1, ...cumulative.map((level) => level.cumulativeUsdc));
  return cumulative.map((level) => ({
    ...level,
    depthPct: Math.max(4, Math.min(100, Math.round((level.cumulativeUsdc / max) * 100)))
  }));
}

function aggregateLevelInputs(levels: Array<Omit<MarketOrderbookLevel, "cumulativeUsdc" | "depthPct">>) {
  const byPrice = new Map<number, Omit<MarketOrderbookLevel, "cumulativeUsdc" | "depthPct">>();
  for (const level of levels) {
    const existing = byPrice.get(level.price);
    if (existing) {
      existing.sizeUsdc = rounded(existing.sizeUsdc + level.sizeUsdc);
      existing.shareEstimate = rounded(existing.shareEstimate + level.shareEstimate);
      existing.orderCount += level.orderCount;
      continue;
    }
    byPrice.set(level.price, { ...level });
  }
  return Array.from(byPrice.values());
}

function clobNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeClobLevels(value: unknown, direction: "bid" | "ask") {
  const byPrice = new Map<number, Omit<MarketOrderbookLevel, "cumulativeUsdc" | "depthPct">>();
  for (const row of asArray(value)) {
    const record = asRecord(row);
    const price = clobNumber(record.price);
    const shares = clobNumber(record.size ?? record.shares ?? record.quantity);
    if (price === null || shares === null || price <= 0 || shares <= 0) continue;
    const key = priceKey(price);
    const existing = byPrice.get(key);
    const sizeUsdc = shares * key;
    if (existing) {
      existing.sizeUsdc = rounded(existing.sizeUsdc + sizeUsdc);
      existing.shareEstimate = rounded(existing.shareEstimate + shares);
      existing.orderCount += 1;
      continue;
    }
    byPrice.set(key, {
      price: key,
      priceCents: priceCents(key),
      sizeUsdc: rounded(sizeUsdc),
      shareEstimate: rounded(shares),
      orderCount: 1
    });
  }

  const sorted = Array.from(byPrice.values())
    .sort((a, b) => direction === "bid" ? b.price - a.price : a.price - b.price)
    .slice(0, 12);
  return withCumulative(sorted);
}

function visibleDepth(book: Pick<PublicMarketOrderbook, "ride" | "fade">) {
  return rounded([
    ...book.ride.bids,
    ...book.ride.asks,
    ...book.fade.bids,
    ...book.fade.asks
  ].reduce((sum, level) => sum + level.sizeUsdc, 0));
}

function levelCount(book: Pick<PublicMarketOrderbook, "ride" | "fade">) {
  return book.ride.bids.length + book.ride.asks.length + book.fade.bids.length + book.fade.asks.length;
}

function emptyOrderbook(market: MarketSnapshot, source: PublicMarketOrderbook["source"] = "empty", errors: string[] = []): PublicMarketOrderbook {
  const book = {
    marketId: market.id,
    marketTitle: market.title,
    marketOrigin: market.origin,
    source,
    status: market.status,
    updatedAt: new Date().toISOString(),
    generated: false,
    ride: emptySide("ride", "YES / Ride"),
    fade: emptySide("fade", "NO / Fade"),
    stats: {
      liquidityUsdc: 0,
      visibleDepthUsdc: 0,
      openInterestUsdc: 0,
      imbalancePct: 0,
      levelCount: 0
    }
  };
  return errors.length ? { ...book, errors } : book;
}

function persistedLevels(orders: OrderSnapshot[], outcome: MarketOrderbookOutcome, direction: "bid" | "ask") {
  const levels = orders
    .filter((order) => order.side === outcome && order.direction === direction && order.remainingUsdc > 0)
    .flatMap((order): Array<Omit<MarketOrderbookLevel, "cumulativeUsdc" | "depthPct">> => {
      const price = priceKey(order.price);
      if (!Number.isFinite(price) || price <= 0) return [];
      const sizeUsdc = rounded(order.remainingUsdc);
      return [{
        price,
        priceCents: priceCents(price),
        sizeUsdc,
        shareEstimate: rounded(order.shareEstimate > 0 ? order.shareEstimate : sizeUsdc / price),
        orderCount: 1
      }];
    });
  return withCumulative(aggregateLevelInputs(levels).sort((a, b) => direction === "bid" ? b.price - a.price : a.price - b.price).slice(0, 12));
}

function persistedOrderbook(market: MarketSnapshot, orders: OrderSnapshot[]): PublicMarketOrderbook {
  const partial = {
    ride: sideWithLevels("ride", "YES / Ride", persistedLevels(orders, "ride", "bid"), persistedLevels(orders, "ride", "ask")),
    fade: sideWithLevels("fade", "NO / Fade", persistedLevels(orders, "fade", "bid"), persistedLevels(orders, "fade", "ask"))
  };
  const rideDepth = [...partial.ride.bids, ...partial.ride.asks].reduce((sum, level) => sum + level.sizeUsdc, 0);
  const fadeDepth = [...partial.fade.bids, ...partial.fade.asks].reduce((sum, level) => sum + level.sizeUsdc, 0);
  const totalDepth = rideDepth + fadeDepth;
  return {
    marketId: market.id,
    marketTitle: market.title,
    marketOrigin: market.origin,
    source: "nexmarkets_orderbook",
    status: market.status,
    updatedAt: new Date().toISOString(),
    generated: false,
    ...partial,
    stats: {
      liquidityUsdc: visibleDepth(partial),
      visibleDepthUsdc: visibleDepth(partial),
      openInterestUsdc: rounded(orders.reduce((sum, order) => sum + Math.max(0, order.remainingUsdc), 0)),
      imbalancePct: totalDepth > 0 ? Math.round(((rideDepth - fadeDepth) / totalDepth) * 100) : 0,
      levelCount: levelCount(partial)
    }
  };
}

async function polymarketOrderbook(market: MarketSnapshot): Promise<PublicMarketOrderbook> {
  const tokens = tokenList(market.polymarketClobTokenIds).slice(0, 2);
  if (!tokens.length) return emptyOrderbook(market, "polymarket_clob", ["This market does not have outcome tokens recorded yet."]);

  const [rideResult, fadeResult] = await Promise.allSettled([
    tokens[0] ? getOrderBook(tokens[0]) : Promise.resolve(null),
    tokens[1] ? getOrderBook(tokens[1]) : Promise.resolve(null)
  ]);
  const errors = [rideResult, fadeResult].flatMap((result) => result.status === "rejected"
    ? [result.reason instanceof Error ? result.reason.message : "Orderbook unavailable"]
    : []);
  const rideRaw = rideResult.status === "fulfilled" ? rideResult.value : null;
  const fadeRaw = fadeResult.status === "fulfilled" ? fadeResult.value : null;
  const partial = {
    ride: sideWithLevels("ride", "YES / Ride", normalizeClobLevels(asRecord(rideRaw).bids, "bid"), normalizeClobLevels(asRecord(rideRaw).asks, "ask")),
    fade: sideWithLevels("fade", "NO / Fade", normalizeClobLevels(asRecord(fadeRaw).bids, "bid"), normalizeClobLevels(asRecord(fadeRaw).asks, "ask"))
  };

  const book: PublicMarketOrderbook = {
    marketId: market.id,
    marketTitle: market.title,
    marketOrigin: market.origin,
    source: "polymarket_clob",
    status: market.status,
    updatedAt: new Date().toISOString(),
    generated: false,
    ...partial,
    stats: {
      liquidityUsdc: visibleDepth(partial),
      visibleDepthUsdc: visibleDepth(partial),
      openInterestUsdc: 0,
      imbalancePct: 0,
      levelCount: levelCount(partial)
    }
  };
  return errors.length ? { ...book, errors } : book;
}

export async function getPublicMarketOrderbook(marketId: string): Promise<PublicMarketOrderbook | null> {
  const snapshot = await withDatabase<Snapshot | null>(
    async (db) => {
      const market = await db.market.findUnique({
        where: { id: marketId },
        select: {
          id: true,
          origin: true,
          status: true,
          title: true,
          polymarketClobTokenIds: true,
          updatedAt: true
        }
      });
      if (!market) return null;
      const orders = await db.marketOrderbookOrder.findMany({
        where: {
          marketId,
          status: { in: ["open", "partial_fill"] },
          remainingUsdc: { gt: 0 },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        select: {
          side: true,
          direction: true,
          price: true,
          remainingUsdc: true,
          shareEstimate: true
        },
        orderBy: [{ createdAt: "asc" }],
        take: 200
      });
      return { market, orders };
    },
    async () => null
  );

  if (!snapshot) return null;
  if (snapshot.market.origin === "native") return persistedOrderbook(snapshot.market, snapshot.orders);
  if (snapshot.market.origin === "polymarket") return polymarketOrderbook(snapshot.market);
  if (snapshot.orders.length) return persistedOrderbook(snapshot.market, snapshot.orders);
  return emptyOrderbook(snapshot.market);
}

export async function createMarketOrderbookOrder(input: {
  marketId: string;
  userId: string;
  walletAddress: string;
  side: "ride" | "fade";
  direction: "bid" | "ask";
  price: number;
  sizeUsdc: number;
  expiresAt?: string;
}) {
  const db = requireDatabase();
  const market = await db.market.findUnique({
    where: { id: input.marketId },
    select: { id: true, origin: true, status: true }
  });
  if (!market) throw new Error("Market not found.");
  if (market.origin !== "native") throw new Error("Resting NexMarkets orderbook orders are only available for native markets.");
  if (market.status !== "trading_live") throw new Error("This market is not open for resting orders yet.");
  const price = priceKey(input.price);
  const sizeUsdc = rounded(input.sizeUsdc);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) throw new Error("Order expiry must be in the future.");

  return db.marketOrderbookOrder.create({
    data: {
      marketId: input.marketId,
      userId: input.userId,
      walletAddress: input.walletAddress,
      side: input.side,
      direction: input.direction,
      price,
      sizeUsdc,
      remainingUsdc: sizeUsdc,
      shareEstimate: rounded(sizeUsdc / price),
      expiresAt,
      raw: {
        orderIntent: "resting_limit",
        custody: "app_recorded",
        note: "Recorded orderbook liquidity. Matching and settlement are handled by the native orderbook workflow."
      } as never
    }
  });
}
