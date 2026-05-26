import { revalidatePath } from "next/cache";
import { InternalAdminPage, InternalCommandPanel, InternalTable } from "@/components/internal-admin-page";
import { getPositionRows } from "@/lib/internal/admin-data";
import { internalPositionSettleSchema } from "@/lib/server/validation";
import { settlePositionForReceipt } from "@/lib/services/receiptService";
import { syncOpenPositionsForSettlement } from "@/lib/services/positionSettlementService";

export const dynamic = "force-dynamic";

async function settlePosition(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const body = internalPositionSettleSchema.parse({
    settlementPrice: formData.get("settlementPrice"),
    source: formData.get("source") || "internal-admin-settlement"
  });
  await settlePositionForReceipt({
    positionId: id,
    settlementPrice: body.settlementPrice,
    source: body.source
  });
  revalidatePath("/internal/positions");
  revalidatePath("/internal/receipts");
}

async function syncOpenPositions() {
  "use server";
  await syncOpenPositionsForSettlement(50);
  revalidatePath("/internal/positions");
  revalidatePath("/internal/receipts");
}

export default async function InternalPositionsPage() {
  const rows = await getPositionRows();
  const finalRows = rows.filter((row) => row.status === "closed" || row.status === "resolved").length;
  const missingSettlement = rows.filter((row) => row.settlement === "unset").length;
  const receipts = rows.filter((row) => row.receipt === "generated").length;
  return (
    <InternalAdminPage
      title="Position Settlement"
      eyebrow="Execution and receipts"
      deck="The list now emphasizes settlement state, execution mode and receipt readiness. Raw position ids and settlement sources are collapsed into audit details."
      stats={[
        { label: "Positions", value: rows.length, note: "Latest 50" },
        { label: "Finalized", value: finalRows, note: "Closed or resolved" },
        { label: "Unset settlement", value: missingSettlement, note: "Receipt not ready" },
        { label: "Receipts", value: receipts, note: "Generated proof" }
      ]}
    >
      <InternalCommandPanel title="Settlement operations" description="Run the automated sync before using manual settlement." defaultOpen>
        <form action={syncOpenPositions} className="internal-form internal-toolbar-form">
          <button type="submit" className="primary">Sync open positions</button>
        </form>
      </InternalCommandPanel>
      <InternalTable
        columns={["id", "identity", "thesis", "status", "entry", "settlement", "executionMode", "receipt", "settle"]}
        primaryColumn="thesis"
        secondaryColumns={["status", "executionMode", "receipt"]}
        metricColumns={["identity", "entry", "settlement"]}
        detailColumns={["id", "source"]}
        statusColumn="status"
        rows={rows.map((row) => ({
          ...row,
          settle: (
            <form action={settlePosition} className="internal-inline-form">
              <input type="hidden" name="id" value={row.id} />
              <input name="settlementPrice" type="number" min="0" max="1" step="0.01" placeholder="0 or 1" />
              <input name="source" defaultValue={row.source || "internal-admin-settlement"} />
              <button type="submit">Settle</button>
            </form>
          )
        }))}
      />
    </InternalAdminPage>
  );
}
