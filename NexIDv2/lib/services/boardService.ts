import type { PrismaClient } from "@prisma/client";
import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import type { BoardEntry, BoardKey } from "@/lib/types/nexid";

const boardKeys = new Set<BoardKey>(["faders", "riders", "receipts", "lowcap", "global", "regional", "ai", "base", "solana", "rwa"]);
const allBoardKeys = Array.from(boardKeys);
type UnrankedBoardEntry = Omit<BoardEntry, "rank" | "rankNumber" | "movement" | "boardKey">;
type SortableBoardEntry = UnrankedBoardEntry & { sortAt?: Date; sortScore?: number };

function identity(user?: { primaryIdName: string | null; displayName?: string | null; walletAddress: string } | null) {
  return resolveIdentityLabel(user);
}

function boardTitle(key: BoardKey) {
  return {
    faders: "Top Faders",
    riders: "Top Riders",
    receipts: "Best Receipts",
    lowcap: "Low-Capital High-Signal",
    global: "Global Points",
    regional: "Regional Edge",
    ai: "AI Agents",
    base: "Base",
    solana: "Solana",
    rwa: "RWA"
  }[key];
}

function categoryTerms(key: BoardKey) {
  const terms: Partial<Record<BoardKey, string[]>> = {
    ai: ["ai", "agent", "agents", "artificial intelligence"],
    base: ["base", "base apps", "onchain"],
    solana: ["solana", "sol", "meme", "memes"],
    rwa: ["rwa", "real world", "treasury", "asset"],
    regional: ["regional", "africa", "nigeria", "emerging", "latin", "asia"]
  };
  return terms[key] ?? [];
}

function matchesMarketCategory(key: BoardKey, market?: { title: string; question: string; arena: string; sourceUrl?: string | null } | null) {
  const terms = categoryTerms(key);
  if (!terms.length) return true;
  if (!market) return false;
  const haystack = `${market.title} ${market.question} ${market.arena} ${market.sourceUrl ?? ""}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function movement(currentRank: number, previousRank?: number) {
  if (!previousRank) return "new";
  if (previousRank === currentRank) return "0";
  return previousRank > currentRank ? `+${previousRank - currentRank}` : `-${currentRank - previousRank}`;
}

function ranked(key: BoardKey, rows: UnrankedBoardEntry[], previous: Map<string, number>) {
  return rows.map((row, index): BoardEntry => {
    const rankNumber = index + 1;
    return {
      ...row,
      boardKey: key,
      rank: `#${rankNumber}`,
      rankNumber,
      movement: movement(rankNumber, previous.get(row.id))
    };
  });
}

function sortedRows(rows: SortableBoardEntry[]) {
  return rows
    .sort((a, b) => (b.sortScore ?? 0) - (a.sortScore ?? 0) || (b.sortAt?.getTime() ?? 0) - (a.sortAt?.getTime() ?? 0))
    .map(({ sortAt, sortScore, ...row }) => row);
}

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberField(payload: Record<string, unknown>, key: string, fallback = 0) {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function previousRanks(db: PrismaClient, key: BoardKey) {
  const snapshot = await db.boardSnapshot.findFirst({
    where: { boardKey: key },
    orderBy: { createdAt: "desc" }
  });
  const payload = snapshot?.payload;
  const entries = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { entries?: unknown }).entries
    : null;
  if (!Array.isArray(entries)) return new Map<string, number>();
  return new Map(entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { id?: unknown; rankNumber?: unknown };
    return typeof row.id === "string" && typeof row.rankNumber === "number" ? [[row.id, row.rankNumber] as const] : [];
  }));
}

async function nativePositionBoardRows(db: PrismaClient, input: { side?: "ride" | "fade"; lowcap?: boolean; boardKey?: BoardKey }): Promise<SortableBoardEntry[]> {
  const nativePositions = await db.nativePosition.findMany({
    where: {
      userId: { not: null },
      ...(input.side ? { side: input.side } : {}),
      ...(input.lowcap ? { notionalUsdc: { lte: 100 } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  const userIds = Array.from(new Set(nativePositions.flatMap((row) => row.userId ? [row.userId] : [])));
  const marketIds = Array.from(new Set(nativePositions.map((row) => row.marketId)));
  if (!userIds.length) return [];

  const [users, markets] = await Promise.all([
    db.user.findMany({
      where: { id: { in: userIds }, pointsTotal: { gt: 0 } }
    }),
    db.market.findMany({
      where: { id: { in: marketIds } }
    })
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const marketById = new Map(markets.map((market) => [market.id, market]));

  return nativePositions.flatMap((position) => {
    const user = position.userId ? userById.get(position.userId) : null;
    if (!user) return [];
    const market = marketById.get(position.marketId);
    if (input.boardKey && !matchesMarketCategory(input.boardKey, market)) return [];
    return [{
      id: `native-position:${position.id}`,
      identity: identity(user),
      thesis: `${position.side === "ride" ? "Rode" : "Faded"} ${market?.title ?? "native NexMarket"}`,
      result: position.status,
      points: `$${position.notionalUsdc.toFixed(0)}`,
      category: market?.arena ?? "native",
      positionId: position.id,
      edgeScore: null,
      sortAt: position.createdAt,
      sortScore: position.notionalUsdc
    }];
  });
}

async function routedPositionBoardRows(db: PrismaClient, input: { side?: "ride" | "fade"; lowcap?: boolean; boardKey?: BoardKey }): Promise<SortableBoardEntry[]> {
  const receipts = await db.marketReceipt.findMany({
    where: {
      userId: { not: null },
      proof: "Polymarket user-authenticated CLOB",
      ...(input.side ? { side: input.side } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  const userIds = Array.from(new Set(receipts.flatMap((row) => row.userId ? [row.userId] : [])));
  const marketIds = Array.from(new Set(receipts.map((row) => row.marketId)));
  if (!userIds.length) return [];

  const [users, markets] = await Promise.all([
    db.user.findMany({
      where: { id: { in: userIds }, pointsTotal: { gt: 0 } }
    }),
    db.market.findMany({
      where: { id: { in: marketIds } }
    })
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const marketById = new Map(markets.map((market) => [market.id, market]));

  return receipts.flatMap((receipt) => {
    const user = receipt.userId ? userById.get(receipt.userId) : null;
    if (!user) return [];
    const market = marketById.get(receipt.marketId);
    if (input.boardKey && !matchesMarketCategory(input.boardKey, market)) return [];
    const payload = payloadRecord(receipt.payload);
    const amount = numberField(payload, "amount");
    if (input.lowcap && amount > 100) return [];
    return [{
      id: `market-receipt-position:${receipt.id}`,
      identity: identity(user),
      thesis: `${receipt.side === "ride" ? "Rode" : "Faded"} ${market?.title ?? receipt.title.replace(/^(Rode|Faded)\s+/i, "")}`,
      result: String(payload.fillStatus ?? "submitted").replace(/_/g, " "),
      points: amount > 0 ? `$${amount.toFixed(0)}` : "routed",
      category: market?.arena ?? "polymarket",
      receiptId: receipt.id,
      positionId: `market-receipt:${receipt.id}`,
      edgeScore: null,
      sortAt: receipt.createdAt,
      sortScore: amount
    }];
  });
}

function emptyBoard(): BoardEntry[] {
  return [];
}

export function normalizeBoardKey(value: string): BoardKey {
  return boardKeys.has(value as BoardKey) ? (value as BoardKey) : "global";
}

export async function getBoard(key: BoardKey): Promise<BoardEntry[]> {
  return withDatabase(
    async (db) => {
      const previous = await previousRanks(db, key);
      if (key === "global") {
        const users = await db.user.findMany({
          where: { pointsTotal: { gt: 0 } },
          orderBy: [{ pointsTotal: "desc" }, { edgeScoreTotal: "desc" }],
          take: 25
        });
        const receiptCounts = users.length ? await db.marketReceipt.groupBy({
          by: ["userId"],
          where: { userId: { in: users.map((user) => user.id) } },
          _count: { _all: true }
        }) : [];
        const receiptsByUser = new Map(receiptCounts.flatMap((row) => row.userId ? [[row.userId, row._count._all] as const] : []));
        return ranked(key, users.map((user) => ({
          id: `global:${user.id}`,
          identity: identity(user),
          thesis: "Season edge profile",
          result: user.edgeScoreTotal ? `Edge ${user.edgeScoreTotal}` : `${receiptsByUser.get(user.id) ?? 0} receipts`,
          points: user.pointsTotal.toLocaleString(),
          category: "season",
          edgeScore: user.edgeScoreTotal
        })), previous);
      }

      if (key === "receipts") {
        const receipts = await db.marketReceipt.findMany({
          where: { userId: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 100
        });
        const userIds = Array.from(new Set(receipts.flatMap((row) => row.userId ? [row.userId] : [])));
        const marketIds = Array.from(new Set(receipts.map((row) => row.marketId)));
        const [users, markets] = await Promise.all([
          userIds.length ? db.user.findMany({ where: { id: { in: userIds }, pointsTotal: { gt: 0 } } }) : Promise.resolve([]),
          marketIds.length ? db.market.findMany({ where: { id: { in: marketIds } } }) : Promise.resolve([])
        ]);
        const userById = new Map(users.map((user) => [user.id, user]));
        const marketById = new Map(markets.map((market) => [market.id, market]));
        const receiptRows: SortableBoardEntry[] = receipts.flatMap((row) => {
          const user = row.userId ? userById.get(row.userId) : null;
          if (!user) return [];
          const market = marketById.get(row.marketId);
          return [{
            id: `market-receipt:${row.id}`,
            identity: identity(user),
            thesis: row.title,
            result: row.proof,
            points: user.pointsTotal.toLocaleString(),
            category: market?.arena ?? "native",
            receiptId: row.id,
            positionId: null,
            edgeScore: null,
            sortAt: row.createdAt,
            sortScore: user.pointsTotal
          }];
        });
        return ranked(key, sortedRows(receiptRows).slice(0, 25), previous);
      }

      const side: "ride" | "fade" = key === "riders" ? "ride" : "fade";
      const boardKey = key === "faders" || key === "riders" || key === "lowcap" ? undefined : key;
      const [nativeRows, routedRows] = await Promise.all([
        nativePositionBoardRows(db, { side: key === "lowcap" || boardKey ? undefined : side, lowcap: key === "lowcap", boardKey }),
        routedPositionBoardRows(db, { side: key === "lowcap" || boardKey ? undefined : side, lowcap: key === "lowcap", boardKey })
      ]);
      return ranked(key, sortedRows([...nativeRows, ...routedRows]).slice(0, 25), previous);
    },
    async () => emptyBoard()
  );
}

export async function getAllBoards(): Promise<Record<BoardKey, BoardEntry[]>> {
  const entries = await Promise.all(allBoardKeys.map(async (key) => [key, await getBoard(key)] as const));
  return Object.fromEntries(entries) as Record<BoardKey, BoardEntry[]>;
}

export async function createBoardSnapshot(key: BoardKey) {
  const entries = await getBoard(key);
  return withDatabase(
    async (db) => {
      const row = await db.boardSnapshot.create({
        data: {
          boardKey: key,
          title: boardTitle(key),
          payload: { entries }
        }
      });
      return {
        id: row.id,
        boardKey: key,
        title: row.title,
        entries,
        createdAt: row.createdAt.toISOString()
      };
    },
    async () => ({
      id: `snapshot_${key}_${Date.now()}`,
      boardKey: key,
      title: boardTitle(key),
      entries,
      createdAt: new Date().toISOString()
    })
  );
}
