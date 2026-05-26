import { revalidatePath } from "next/cache";
import { InternalAdminPage, InternalTable } from "@/components/internal-admin-page";
import { getQualityRows } from "@/lib/internal/admin-data";
import { updateNarrativeAdmin } from "@/lib/services/internalAdminService";

export const dynamic = "force-dynamic";

async function updateQuality(formData: FormData) {
  "use server";
  await updateNarrativeAdmin(String(formData.get("id") || ""), {
    quality: formData.get("quality") as "Strong" | "Hot" | "Clean" | "Mixed",
    tradable: formData.get("tradable") === "on",
    fallbackReason: String(formData.get("fallbackReason") || "") || null
  });
  revalidatePath("/internal/quality-review");
  revalidatePath("/internal/narrative-mapping");
  revalidatePath("/narratives");
}

export default async function QualityReviewPage() {
  const rows = await getQualityRows();
  const blocked = rows.filter((row) => row.tradable === "no").length;
  const riskRows = rows.filter((row) => row.risk !== "Normal").length;
  const staleRows = rows.filter((row) => row.dataFreshness === "unmapped").length;
  return (
    <InternalAdminPage
      title="Quality Review"
      eyebrow="No-trade and broken data states"
      deck="Focus on the trade decision first. Market ids and exact no-trade notes are available only when the operator opens the audit detail."
      stats={[
        { label: "Review rows", value: rows.length, note: "Narratives in scope" },
        { label: "Blocked", value: blocked, note: "No-trade active" },
        { label: "Risk signals", value: riskRows, note: "Liquidity or spread issue" },
        { label: "Unmapped", value: staleRows, note: "Missing fresh market data" }
      ]}
    >
      <InternalTable
        columns={["id", "name", "dataFreshness", "marketQuality", "noTradeReason", "risk", "tradable", "actions"]}
        primaryColumn="name"
        secondaryColumns={["risk", "tradable"]}
        metricColumns={["dataFreshness", "marketQuality"]}
        detailColumns={["id", "noTradeReason"]}
        statusColumn="risk"
        rows={rows.map((row) => ({
          ...row,
          actions: (
            <form action={updateQuality} className="internal-inline-form">
              <input name="id" type="hidden" value={String(row.id)} />
              <select name="quality" defaultValue={String(row.marketQuality)}><option>Strong</option><option>Hot</option><option>Clean</option><option>Mixed</option></select>
              <label><input name="tradable" type="checkbox" defaultChecked={row.tradable === "yes"} /> tradable</label>
              <input name="fallbackReason" defaultValue={String(row.noTradeReason)} placeholder="No-trade reason" />
              <button type="submit">Apply</button>
            </form>
          )
        }))}
      />
    </InternalAdminPage>
  );
}
