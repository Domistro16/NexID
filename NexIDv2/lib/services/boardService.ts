import type { PrismaClient } from "@prisma/client";
import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import type { BoardEntry, BoardKey } from "@/lib/types/nexid";

const boardKeys = new Set<BoardKey>(["faders", "riders", "receipts", "lowcap", "global", "regional", "ai", "base", "solana", "rwa"]);
const allBoardKeys = Array.from(boardKeys);

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

function matchesCategory(key: BoardKey, narrative: { name: string; tag: string; summary?: string | null }) {
  const terms = categoryTerms(key);
  if (!terms.length) return true;
  const haystack = `${narrative.name} ${narrative.tag} ${narrative.summary ?? ""}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function movement(currentRank: number, previousRank?: number) {
  if (!previousRank) return "new";
  if (previousRank === currentRank) return "0";
  return previousRank > currentRank ? `+${previousRank - currentRank}` : `-${currentRank - previousRank}`;
}

function ranked(key: BoardKey, rows: Omit<BoardEntry, "rank" | "rankNumber" | "movement" | "boardKey">[], previous: Map<string, number>) {
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
          include: { receipts: true },
          take: 25
        });
        return ranked(key, users.map((user) => ({
          id: `global:${user.id}`,
          identity: identity(user),
          thesis: "Season edge profile",
          result: user.edgeScoreTotal ? `Edge ${user.edgeScoreTotal}` : `${user.receipts.length} receipts`,
          points: user.pointsTotal.toLocaleString(),
          category: "season",
          edgeScore: user.edgeScoreTotal
        })), previous);
      }

      if (key === "receipts") {
        const rows = await db.receipt.findMany({
          where: { status: "ready", user: { is: { pointsTotal: { gt: 0 } } } },
          include: { user: true, position: { include: { narrative: true } } },
          orderBy: [{ edgeScore: "desc" }, { edgePoints: "desc" }, { createdAt: "desc" }],
          take: 25
        });
        return ranked(key, rows.map((row) => ({
          id: `receipt:${row.id}`,
          identity: identity(row.user),
          thesis: `${row.position.side === "ride" ? "Rode" : "Faded"} ${row.position.narrative.name}`,
          result: `${row.returnPct > 0 ? "+" : ""}${row.returnPct}%`,
          points: row.edgePoints.toLocaleString(),
          category: row.position.narrative.tag,
          receiptId: row.id,
          positionId: row.positionId,
          edgeScore: row.edgeScore
        })), previous);
      }

      const side: "ride" | "fade" = key === "riders" ? "ride" : "fade";
      const where =
        key === "lowcap"
          ? { amount: { lte: 100 }, user: { is: { pointsTotal: { gt: 0 } } } }
          : key === "faders" || key === "riders"
            ? { side, user: { is: { pointsTotal: { gt: 0 } } } }
            : { user: { is: { pointsTotal: { gt: 0 } } } };
      const rows = await db.position.findMany({
        where,
        include: { user: true, narrative: true, receipt: true },
        orderBy: [{ createdAt: "desc" }],
        take: 100
      });
      const filtered = rows.filter((row) => key === "faders" || key === "riders" || key === "lowcap" || matchesCategory(key, row.narrative)).slice(0, 25);
      return ranked(key, filtered.map((row) => ({
        id: `position:${row.id}`,
        identity: identity(row.user),
        thesis: `${row.side === "ride" ? "Rode" : "Faded"} ${row.narrative.name}`,
        result: row.receipt ? `${row.receipt.returnPct > 0 ? "+" : ""}${row.receipt.returnPct}%` : row.status,
        points: row.receipt ? row.receipt.edgePoints.toLocaleString() : `$${row.amount.toFixed(0)}`,
        category: row.narrative.tag,
        receiptId: row.receipt?.id ?? null,
        positionId: row.id,
        edgeScore: row.receipt?.edgeScore ?? row.marketQualityScore ?? null
      })), previous);
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
