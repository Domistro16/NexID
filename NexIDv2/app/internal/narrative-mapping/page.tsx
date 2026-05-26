import { revalidatePath } from "next/cache";
import { InternalAdminPage, InternalCommandPanel, InternalTable } from "@/components/internal-admin-page";
import { getMappingRows } from "@/lib/internal/admin-data";
import { internalNarrativeCreateSchema } from "@/lib/server/validation";
import { updateNarrativeAdmin } from "@/lib/services/internalAdminService";
import { getNarrativeById, upsertNarrative } from "@/lib/services/narrativeService";
import { refreshMappedMarketsForNarrative } from "@/lib/services/marketMappingService";

export const dynamic = "force-dynamic";

async function createLaunchNarrative(formData: FormData) {
  "use server";
  const body = internalNarrativeCreateSchema.parse({
    id: formData.get("id"),
    name: formData.get("name"),
    tag: formData.get("tag"),
    summary: formData.get("summary"),
    heat: formData.get("heat"),
    move7d: formData.get("move7d"),
    quality: formData.get("quality") || "Strong",
    liquidity: formData.get("liquidity"),
    spread: formData.get("spread"),
    volume: formData.get("volume"),
    riders: formData.get("riders") || 0,
    faders: formData.get("faders") || 0,
    expiry: formData.get("expiry"),
    top: formData.get("top") || "+0%",
    ridePrice: formData.get("ridePrice"),
    fadePrice: formData.get("fadePrice"),
    chart: formData.get("chart"),
    comments: formData.get("comments"),
    rules: formData.get("rules"),
    tradable: formData.get("tradable") === "on",
    fallbackReason: formData.get("fallbackReason") || null,
    bestMarketId: formData.get("bestMarketId") || null
  });
  await upsertNarrative(body);
  revalidatePath("/internal/narrative-mapping");
  revalidatePath("/narratives");
}

async function updateMapping(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  await updateNarrativeAdmin(id, {
    quality: formData.get("quality") as "Strong" | "Hot" | "Clean" | "Mixed",
    tradable: formData.get("tradable") === "on",
    fallbackReason: String(formData.get("fallbackReason") || "") || null,
    bestMarketId: String(formData.get("bestMarketId") || "") || null
  });
  revalidatePath("/internal/narrative-mapping");
  revalidatePath("/narratives");
}

async function refreshMapping(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  const narrative = await getNarrativeById(id);
  if (!narrative) throw new Error("Narrative not found");
  await refreshMappedMarketsForNarrative(narrative);
  revalidatePath("/internal/narrative-mapping");
  revalidatePath("/internal/quality-review");
  revalidatePath("/narratives");
}

export default async function NarrativeMappingPage() {
  const rows = await getMappingRows();
  const tradable = rows.filter((row) => row.status === "Tradable").length;
  const unmapped = rows.filter((row) => !row.bestMarketId).length;
  return (
    <InternalAdminPage
      title="Narrative Mapping"
      eyebrow="Raw markets to NexID narratives"
      deck="Keep the launch slate readable: name, quality, heat and trade state stay visible; market ids and fallback notes sit inside audit details."
      stats={[
        { label: "Narratives", value: rows.length, note: "Mapped launch slate" },
        { label: "Tradable", value: tradable, note: "Visible for execution" },
        { label: "No-trade", value: rows.length - tradable, note: "Blocked or waiting" },
        { label: "Unmapped", value: unmapped, note: "Needs market refresh" }
      ]}
    >
      <InternalCommandPanel title="Create launch narrative" description="Full narrative creation fields are tucked away until an operator needs them.">
        <form action={createLaunchNarrative} className="internal-form internal-form-grid">
          <input name="id" placeholder="slug, e.g. ai-agents" required />
          <input name="name" placeholder="Name" required />
          <input name="tag" placeholder="Tag" required />
          <input name="summary" placeholder="Summary" required />
          <input name="heat" type="number" min="0" max="100" placeholder="Heat" required />
          <input name="move7d" type="number" min="-100" max="100" placeholder="7D move" required />
          <select name="quality" defaultValue="Strong"><option>Strong</option><option>Hot</option><option>Clean</option><option>Mixed</option></select>
          <input name="liquidity" type="number" min="0" placeholder="Liquidity" required />
          <input name="spread" type="number" min="0" step="0.1" placeholder="Spread" required />
          <input name="volume" type="number" min="0" placeholder="Volume" required />
          <input name="riders" type="number" min="0" placeholder="Riders" />
          <input name="faders" type="number" min="0" placeholder="Faders" />
          <input name="expiry" placeholder="Expiry" required />
          <input name="top" placeholder="Top result, e.g. +48%" />
          <input name="ridePrice" type="number" min="0.01" max="0.99" step="0.01" placeholder="Ride price" required />
          <input name="fadePrice" type="number" min="0.01" max="0.99" step="0.01" placeholder="Fade price" required />
          <input name="chart" placeholder="Chart points: 40,45,50,58" />
          <textarea name="comments" placeholder="One activity note per line" />
          <textarea name="rules" placeholder="One rule per line" />
          <label className="internal-check"><input name="tradable" type="checkbox" defaultChecked /> Tradable</label>
          <input name="fallbackReason" placeholder="No-trade reason" />
          <input name="bestMarketId" placeholder="Best Polymarket market id" />
          <button className="primary" type="submit">Save launch narrative</button>
        </form>
      </InternalCommandPanel>
      <InternalTable
        columns={["name", "tag", "quality", "status", "heat", "liquidity", "spread", "id", "bestMarketId", "fallbackReason", "sideMap", "actions"]}
        primaryColumn="name"
        secondaryColumns={["tag", "quality", "status"]}
        metricColumns={["heat", "liquidity", "spread"]}
        detailColumns={["id", "bestMarketId", "fallbackReason", "sideMap"]}
        statusColumn="status"
        rows={rows.map((row) => ({
          ...row,
          actions: (
            <div className="internal-actions">
              <form action={updateMapping} className="internal-inline-form">
                <input name="id" type="hidden" value={String(row.id)} />
                <select name="quality" defaultValue={String(row.quality)}><option>Strong</option><option>Hot</option><option>Clean</option><option>Mixed</option></select>
                <label><input name="tradable" type="checkbox" defaultChecked={row.status === "Tradable"} /> tradable</label>
                <input name="bestMarketId" defaultValue={String(row.bestMarketId)} placeholder="market id" />
                <input name="fallbackReason" defaultValue={String(row.fallbackReason)} placeholder="reason" />
                <button type="submit">Save</button>
              </form>
              <form action={refreshMapping}>
                <input name="id" type="hidden" value={String(row.id)} />
                <button type="submit">Refresh markets</button>
              </form>
            </div>
          )
        }))}
      />
    </InternalAdminPage>
  );
}
