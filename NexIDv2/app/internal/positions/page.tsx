import Link from "next/link";
import { InternalAdminPage, InternalCommandPanel, InternalTable } from "@/components/internal-admin-page";
import { getPositionRows } from "@/lib/internal/admin-data";

export const dynamic = "force-dynamic";

export default async function InternalPositionsPage() {
  const rows = await getPositionRows();
  const nativeRows = rows.filter((row) => row.executionMode === "native market").length;
  const routedRows = rows.filter((row) => row.executionMode === "polymarket route").length;
  const receipts = rows.filter((row) => row.receipt === "saved").length;
  return (
    <InternalAdminPage
      title="Market Positions"
      eyebrow="Current trading activity"
      deck="This view reads NativePosition and MarketReceipt activity from the current NexMarkets flow. Legacy narrative settlement rows are no longer part of this page."
      stats={[
        { label: "Positions", value: rows.length, note: "Latest 50" },
        { label: "Native", value: nativeRows, note: "Onchain market trades" },
        { label: "Routed", value: routedRows, note: "Polymarket routes" },
        { label: "Receipts", value: receipts, note: "Saved market proof" }
      ]}
    >
      <InternalCommandPanel title="Resolution operations" description="Native market settlement is handled by ProofFlow." defaultOpen>
        <Link className="primary" href="/internal/native-resolution">Open native resolution</Link>
      </InternalCommandPanel>
      <InternalTable
        columns={["id", "identity", "thesis", "status", "entry", "settlement", "executionMode", "receipt"]}
        primaryColumn="thesis"
        secondaryColumns={["status", "executionMode", "receipt"]}
        metricColumns={["identity", "entry", "settlement"]}
        detailColumns={["id", "source"]}
        statusColumn="status"
        rows={rows}
      />
    </InternalAdminPage>
  );
}
