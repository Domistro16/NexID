import { revalidatePath } from "next/cache";
import { InternalAdminPage, InternalCommandPanel, InternalTable } from "@/components/internal-admin-page";
import { getNativeResolutionRows } from "@/lib/internal/admin-data";
import { nativeResolutionBotRunSchema, nativeResolutionQueueSchema } from "@/lib/server/validation";
import { queueNativeMarketUmaAssertion, runNativeResolutionBot } from "@/lib/services/nativeResolutionBotService";

export const dynamic = "force-dynamic";

async function runBot(formData: FormData) {
  "use server";
  const input = nativeResolutionBotRunSchema.parse({
    chainId: formData.get("chainId") || undefined,
    limit: formData.get("limit") || 10,
    force: formData.get("force") === "on"
  });
  await runNativeResolutionBot(input);
  revalidatePath("/internal/native-resolution");
  revalidatePath("/market");
}

async function queueAssertion(formData: FormData) {
  "use server";
  const input = nativeResolutionQueueSchema.parse({
    marketId: formData.get("marketId"),
    outcome: formData.get("outcome"),
    claim: formData.get("claim")
  });
  await queueNativeMarketUmaAssertion(input);
  revalidatePath("/internal/native-resolution");
}

export default async function InternalNativeResolutionPage() {
  const rows = await getNativeResolutionRows();
  const closed = rows.filter((row) => row.status === "closed").length;
  const queued = rows.filter((row) => row.resolution === "ready_to_assert").length;
  const asserted = rows.filter((row) => row.resolution === "asserted" || row.resolution === "disputed").length;
  const final = rows.filter((row) => row.status === "settled" || row.status === "invalid_refund").length;

  return (
    <InternalAdminPage
      title="Native Resolution"
      eyebrow="UMA settlement bot"
      deck="The bot closes expired native markets, submits reviewed UMA assertions, settles ready assertions, and syncs onchain state back into market rooms."
      stats={[
        { label: "Native markets", value: rows.length, note: "Latest 50" },
        { label: "Closed", value: closed, note: "Ready for review" },
        { label: "Queued", value: queued, note: "Waiting for bot" },
        { label: "Asserted", value: asserted, note: "UMA liveness" },
        { label: "Final", value: final, note: "Settled/refund" }
      ]}
    >
      <InternalCommandPanel title="Run resolution bot" description="Runs close, assert, settle and event sync. Cron should hit the same internal route.">
        <form action={runBot} className="internal-form internal-toolbar-form">
          <input name="chainId" placeholder="84532 or 8453" />
          <input name="limit" type="number" min="1" max="25" defaultValue="10" />
          <label className="internal-check"><input name="force" type="checkbox" /> Force run</label>
          <button type="submit" className="primary">Run bot</button>
        </form>
      </InternalCommandPanel>

      <InternalTable
        columns={["title", "status", "resolution", "outcome", "close", "mode", "deadline", "id", "contract", "assertion", "source", "error", "actions"]}
        primaryColumn="title"
        secondaryColumns={["status", "resolution", "outcome"]}
        metricColumns={["close", "mode", "deadline"]}
        detailColumns={["id", "contract", "assertion", "source", "error"]}
        statusColumn="resolution"
        rows={rows.map((row) => ({
          ...row,
          actions: (
            <form action={queueAssertion} className="internal-inline-form">
              <input type="hidden" name="marketId" value={row.id} />
              <select name="outcome" defaultValue={String(row.outcome || "ride")}>
                <option value="ride">Ride</option>
                <option value="fade">Fade</option>
                <option value="invalid">Invalid</option>
              </select>
              <textarea
                name="claim"
                placeholder="UMA claim with source, result and timestamp"
                defaultValue={row.source ? `NexMarkets market \"${row.title}\" resolves according to ${row.source}.` : ""}
              />
              <button type="submit">Queue UMA assertion</button>
            </form>
          )
        }))}
      />
    </InternalAdminPage>
  );
}
