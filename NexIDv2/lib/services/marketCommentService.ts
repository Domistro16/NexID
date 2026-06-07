import type { AuthUser } from "@/lib/types/nexid";
import { requireDatabase, withDatabase } from "@/lib/server/db";
import { stripIdSuffix } from "@/lib/identity";

export type PublicMarketComment = {
  id: string;
  marketId: string;
  authorLabel: string;
  walletAddress: string | null;
  userId: string | null;
  body: string;
  createdAt: string;
};

function shortWallet(value?: string | null) {
  if (!value) return "guest";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function authorLabelForUser(user: AuthUser | null) {
  if (!user) return "guest";
  if (user.primaryIdName) return `${stripIdSuffix(user.primaryIdName)}.id`;
  if (user.primaryDomainName) return user.primaryDomainName;
  if (user.displayName) return user.displayName;
  return shortWallet(user.walletAddress);
}

function serializeComment(row: {
  id: string;
  marketId: string;
  authorLabel: string;
  walletAddress: string | null;
  userId: string | null;
  body: string;
  createdAt: Date;
}): PublicMarketComment {
  return {
    id: row.id,
    marketId: row.marketId,
    authorLabel: row.authorLabel,
    walletAddress: row.walletAddress,
    userId: row.userId,
    body: row.body,
    createdAt: row.createdAt.toISOString()
  };
}

export async function listMarketComments(marketId: string) {
  return withDatabase(
    async (db) => {
      const rows = await db.marketComment.findMany({
        where: { marketId, status: "visible" },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      return rows.map(serializeComment);
    },
    async () => []
  );
}

export async function createMarketComment(input: { marketId: string; body: string; user: AuthUser | null }) {
  const body = input.body.trim().replace(/\s+/g, " ");
  if (!body) throw new Error("Write a comment before posting.");
  if (body.length > 600) throw new Error("Comment must be 600 characters or less.");

  const db = requireDatabase();
  const market = await db.market.findUnique({ where: { id: input.marketId }, select: { id: true } });
  if (!market) throw new Error("Market not found.");

  const row = await db.marketComment.create({
    data: {
      marketId: input.marketId,
      userId: input.user?.id ?? null,
      walletAddress: input.user?.walletAddress ?? null,
      authorLabel: authorLabelForUser(input.user),
      body
    }
  });

  return serializeComment(row);
}
