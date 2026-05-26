import { revalidatePath } from "next/cache";
import { InternalAdminPage, InternalTable } from "@/components/internal-admin-page";
import { getReceiptRows } from "@/lib/internal/admin-data";
import { updateReceiptAdmin } from "@/lib/services/internalAdminService";

export const dynamic = "force-dynamic";

async function updateReceipt(formData: FormData) {
  "use server";
  await updateReceiptAdmin(String(formData.get("id") || ""), {
    status: formData.get("status") as "draft" | "ready" | "disputed" | "archived",
    proofLevel: String(formData.get("proofLevel") || "")
  });
  revalidatePath("/internal/receipts");
  revalidatePath("/receipts");
  revalidatePath("/dashboard");
}

export default async function InternalReceiptsPage() {
  const rows = await getReceiptRows();
  const ready = rows.filter((row) => row.reviewStatus === "ready").length;
  const disputed = rows.filter((row) => row.reviewStatus === "disputed").length;
  const archived = rows.filter((row) => row.reviewStatus === "archived").length;
  return (
    <InternalAdminPage
      title="Receipt Review"
      eyebrow="Proof levels and disputes"
      deck="Receipt review is centered on public status, proof level and result. Receipt ids are still available, but only inside the audit detail."
      stats={[
        { label: "Receipts", value: rows.length, note: "Latest generated proof" },
        { label: "Ready", value: ready, note: "Public promotion" },
        { label: "Disputed", value: disputed, note: "Needs operator review" },
        { label: "Archived", value: archived, note: "Hidden from promotion" }
      ]}
    >
      <InternalTable
        columns={["id", "identity", "thesis", "result", "points", "rank", "proofLevel", "reviewStatus", "actions"]}
        primaryColumn="thesis"
        secondaryColumns={["reviewStatus", "proofLevel"]}
        metricColumns={["identity", "result", "points", "rank"]}
        detailColumns={["id"]}
        statusColumn="reviewStatus"
        rows={rows.map((row) => ({
          ...row,
          actions: (
            <form action={updateReceipt} className="internal-inline-form">
              <input name="id" type="hidden" value={String(row.id)} />
              <select name="status" defaultValue={String(row.reviewStatus)}><option>draft</option><option>ready</option><option>disputed</option><option>archived</option></select>
              <input name="proofLevel" defaultValue={String(row.proofLevel)} />
              <button type="submit">Update</button>
            </form>
          )
        }))}
      />
    </InternalAdminPage>
  );
}
