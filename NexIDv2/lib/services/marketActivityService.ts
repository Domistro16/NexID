import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import type { Position, Receipt, ReceiptSide, Side } from "@/lib/types/nexid";

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
  if (value === "closed" || value === "resolved" || value === "failed" || value === "partial_fill" || value === "filled" || value === "pending") return value;
  return "live";
}

function entryPrice(notional: number, shares: number) {
  if (shares <= 0 || notional <= 0) return 1;
  return Math.max(0, Math.min(1, notional / shares));
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
