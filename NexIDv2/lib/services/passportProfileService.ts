import { resolveIdentityLabel } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";

export type PublicPassportProfile = {
  name: string;
  identity: string;
  walletAddress: string | null;
  pointsTotal: number;
  edgeScoreTotal: number;
  rewardBadge: string;
  receipts: Array<{ id: string; title: string; result: string; points: number }>;
};

export async function getPublicPassportProfile(nameInput: string): Promise<PublicPassportProfile | null> {
  const clean = nameInput.toLowerCase().replace(/\.id$/i, "").replace(/[^a-z0-9-]/g, "");
  if (!clean) return null;

  return withDatabase(
    async (db) => {
      const idName = await db.idName.findUnique({ where: { name: clean }, include: { user: true } });
      const user = idName?.user ?? await db.user.findFirst({
        where: {
          OR: [
            { primaryIdName: clean },
            { displayName: `${clean}.id` }
          ]
        }
      });
      if (!user) return null;
      const receipts = await db.receipt.findMany({
        where: { userId: user.id, status: "ready" },
        include: { position: { include: { narrative: true } } },
        orderBy: [{ edgeScore: "desc" }, { createdAt: "desc" }],
        take: 6
      });
      return {
        name: `${clean}.id`,
        identity: resolveIdentityLabel(user),
        walletAddress: user.walletAddress,
        pointsTotal: user.pointsTotal,
        edgeScoreTotal: user.edgeScoreTotal,
        rewardBadge: user.rewardBadge,
        receipts: receipts.map((receipt) => ({
          id: receipt.id,
          title: `${receipt.position.side === "ride" ? "Rode" : "Faded"} ${receipt.position.narrative.name}`,
          result: `${receipt.returnPct > 0 ? "+" : ""}${receipt.returnPct}%`,
          points: receipt.edgePoints
        }))
      };
    },
    async () => null
  );
}
