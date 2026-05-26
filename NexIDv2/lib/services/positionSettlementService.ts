import { withDatabase } from "@/lib/server/db";
import { createReceiptForPosition } from "@/lib/services/receiptService";
import { syncPositionExecution } from "@/lib/services/positionService";
import { resolveIdentityLabel } from "@/lib/identity";

const openStatuses = ["pending", "live", "partial_fill", "filled", "closed"] as const;

function isReceiptEligible(position: { status: string; settlementPrice?: number | null; exitPrice?: number | null }) {
  return (position.status === "closed" || position.status === "resolved") && (position.settlementPrice != null || position.exitPrice != null);
}

export async function syncOpenPositionsForSettlement(limit = 25) {
  return withDatabase(
    async (db) => {
      const positions = await db.position.findMany({
        where: {
          status: { in: [...openStatuses] },
          receipt: null
        },
        include: { user: true, narrative: true },
        orderBy: { updatedAt: "asc" },
        take: limit
      });
      const results: Array<{ id: string; status: string; receiptId?: string; error?: string }> = [];

      for (const position of positions) {
        try {
          let current = position;
          if (position.executionMode === "operator_controlled" && position.executionId) {
            await syncPositionExecution(position.id, position.userId ?? undefined);
            const updated = await db.position.findUnique({
              where: { id: position.id },
              include: { user: true, narrative: true }
            });
            if (updated) current = updated;
          }

          if (isReceiptEligible(current) && current.userId) {
            const receipt = await createReceiptForPosition({
              positionId: current.id,
              userId: current.userId,
              side: current.side,
              identity: resolveIdentityLabel(current.user),
              amount: current.amount,
              entryPrice: current.entryPrice
            });
            results.push({ id: current.id, status: current.status, receiptId: receipt.id });
          } else {
            results.push({ id: current.id, status: current.status });
          }
        } catch (error) {
          results.push({ id: position.id, status: position.status, error: error instanceof Error ? error.message : "Sync failed" });
        }
      }

      return {
        checked: positions.length,
        settled: results.filter((item) => item.receiptId).length,
        results
      };
    },
    async () => ({ checked: 0, settled: 0, results: [] })
  );
}
