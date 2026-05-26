import { revalidatePath } from "next/cache";
import { InternalAdminPage, InternalCommandPanel, InternalTable } from "@/components/internal-admin-page";
import { getPointsRows } from "@/lib/internal/admin-data";
import { adjustPointsAdmin } from "@/lib/services/internalAdminService";

export const dynamic = "force-dynamic";

async function adjustPoints(formData: FormData) {
  "use server";
  await adjustPointsAdmin({
    userId: String(formData.get("userId") || ""),
    points: Number(formData.get("points") || 0),
    reason: String(formData.get("reason") || "manual_review")
  });
  revalidatePath("/internal/points");
  revalidatePath("/points");
  revalidatePath("/dashboard");
}

export default async function InternalPointsPage() {
  const rows = await getPointsRows();
  const totalPoints = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const receiptCount = rows.reduce((sum, row) => sum + Number(row.receipts || 0), 0);
  return (
    <InternalAdminPage
      title="Points Ledger"
      eyebrow="Season engine and abuse checks"
      deck="The leaderboard view shows identity, rank, points and latest event. User ids move into audit details so the operator only sees them when adjusting a ledger row."
      stats={[
        { label: "Users", value: rows.length, note: "Ranked accounts" },
        { label: "Total points", value: totalPoints.toLocaleString(), note: "Season ledger" },
        { label: "Receipts", value: receiptCount, note: "Proof-backed rows" },
        { label: "Review mode", value: "Manual", note: "Adjustments are audited" }
      ]}
    >
      <InternalCommandPanel title="Manual points adjustment" description="Use only after review; the target user id is available inside each audit detail.">
        <form action={adjustPoints} className="internal-form internal-adjust-form">
          <input name="userId" placeholder="User id" required />
          <input name="points" type="number" placeholder="+/- points" required />
          <input name="reason" placeholder="Reason" required />
          <button className="primary" type="submit">Adjust points</button>
        </form>
      </InternalCommandPanel>
      <InternalTable
        columns={["userId", "identity", "latestReason", "total", "receipts", "rank", "abuseFlag"]}
        primaryColumn="identity"
        secondaryColumns={["rank", "abuseFlag"]}
        metricColumns={["total", "receipts", "latestReason"]}
        detailColumns={["userId"]}
        rows={rows}
      />
    </InternalAdminPage>
  );
}
