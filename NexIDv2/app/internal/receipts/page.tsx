import { InternalAdminPage, InternalTable } from "@/components/internal-admin-page";
import { getReceiptRows } from "@/lib/internal/admin-data";

export const dynamic = "force-dynamic";

export default async function InternalReceiptsPage() {
  const rows = await getReceiptRows();
  const tradeReceipts = rows.filter((row) => String(row.proofLevel).toLowerCase().includes("trade") || String(row.proofLevel).toLowerCase().includes("clob")).length;
  const launchReceipts = rows.filter((row) => String(row.proofLevel).toLowerCase().includes("launch")).length;
  const settlementReceipts = rows.filter((row) => String(row.proofLevel).toLowerCase().includes("settlement")).length;
  return (
    <InternalAdminPage
      title="Receipt Review"
      eyebrow="Market proof ledger"
      deck="This view reads the current MarketReceipt ledger: trades, launches and settlements saved by the live NexMarkets flow."
      stats={[
        { label: "Receipts", value: rows.length, note: "Latest market proof" },
        { label: "Trades", value: tradeReceipts, note: "Native or routed orders" },
        { label: "Launches", value: launchReceipts, note: "Creator proof" },
        { label: "Settlements", value: settlementReceipts, note: "Resolved markets" }
      ]}
    >
      <InternalTable
        columns={["id", "identity", "thesis", "result", "points", "rank", "proofLevel", "reviewStatus"]}
        primaryColumn="thesis"
        secondaryColumns={["reviewStatus", "proofLevel"]}
        metricColumns={["identity", "result", "points", "rank"]}
        detailColumns={["id"]}
        statusColumn="reviewStatus"
        rows={rows}
      />
    </InternalAdminPage>
  );
}
