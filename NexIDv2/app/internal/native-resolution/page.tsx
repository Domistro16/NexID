import { revalidatePath } from "next/cache";
import { InternalAdminPage, InternalCommandPanel, InternalTable } from "@/components/internal-admin-page";
import { getNativeResolutionRows } from "@/lib/internal/admin-data";
import {
  nativeResolutionApproveSchema,
  nativeResolutionBotRunSchema,
  nativeResolutionQueueSchema,
  nativeResolutionVerifySchema,
  proofFlowConflictReviewSchema
} from "@/lib/server/validation";
import { runNativeResolutionBot } from "@/lib/services/nativeResolutionBotService";
import { verifyNativeMarketResult } from "@/lib/services/nativeResultVerificationService";
import {
  finalizeProofFlowMarket,
  listProofFlowReviewerConflictReports,
  reviewProofFlowReviewerConflict,
  submitProofFlowProvisional
} from "@/lib/services/proofFlowService";

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

async function submitProvisional(formData: FormData) {
  "use server";
  const input = nativeResolutionQueueSchema.parse({
    marketId: formData.get("marketId"),
    outcome: formData.get("outcome"),
    claim: formData.get("claim")
  });
  await submitProofFlowProvisional({
    marketId: input.marketId,
    outcome: input.outcome,
    evidenceText: input.claim,
    force: true
  });
  revalidatePath("/internal/native-resolution");
}

async function verifyResult(formData: FormData) {
  "use server";
  const input = nativeResolutionVerifySchema.parse({
    marketId: formData.get("marketId"),
    autoQueue: formData.get("autoQueue") === "on",
    force: formData.get("force") === "on"
  });
  await verifyNativeMarketResult(input.marketId, input);
  revalidatePath("/internal/native-resolution");
  revalidatePath(`/market/${input.marketId}`);
}

async function approveVerifiedResult(formData: FormData) {
  "use server";
  const input = nativeResolutionApproveSchema.parse({
    marketId: formData.get("marketId"),
    proposerWallet: formData.get("proposerWallet") || undefined,
    outcome: formData.get("outcome") || undefined,
    evidenceText: formData.get("evidenceText") || undefined,
    sourceUrl: formData.get("sourceUrl") || undefined
  });
  await finalizeProofFlowMarket({
    marketId: input.marketId,
    walletAddress: input.proposerWallet,
    outcome: input.outcome,
    evidenceText: input.evidenceText,
    sourceUrl: input.sourceUrl,
    force: true
  });
  revalidatePath("/internal/native-resolution");
  revalidatePath(`/market/${input.marketId}`);
}

async function reviewConflictReport(formData: FormData) {
  "use server";
  const input = proofFlowConflictReviewSchema.parse({
    reportId: formData.get("reportId"),
    action: formData.get("action"),
    moderatorWallet: formData.get("moderatorWallet") || undefined,
    moderationNote: formData.get("moderationNote") || undefined
  });
  await reviewProofFlowReviewerConflict(input);
  revalidatePath("/internal/native-resolution");
}

export default async function InternalNativeResolutionPage() {
  const [rows, conflictReports] = await Promise.all([
    getNativeResolutionRows(),
    listProofFlowReviewerConflictReports({ limit: 50 })
  ]);
  const closed = rows.filter((row) => row.status === "closed").length;
  const queued = rows.filter((row) => row.resolution === "challenge_open").length;
  const asserted = rows.filter((row) => row.resolution === "evidence_review" || row.status === "disputed").length;
  const final = rows.filter((row) => row.status === "settled" || row.status === "invalid_refund").length;

  return (
    <InternalAdminPage
      title="Native Resolution"
      eyebrow="ProofFlow settlement"
      deck="ProofFlow closes expired native markets, verifies locked sources, opens public challenge windows, records evidence review, and finalizes or refunds markets transparently."
      stats={[
        { label: "Native markets", value: rows.length, note: "Latest 50" },
        { label: "Closed", value: closed, note: "Ready for review" },
        { label: "Challenge open", value: queued, note: "Provisional" },
        { label: "Evidence review", value: asserted, note: "Challenged" },
        { label: "Final", value: final, note: "Settled/refund" }
      ]}
    >
      <InternalCommandPanel title="Run ProofFlow bot" description="Runs close, source verification, challenge-window finalization and optional event sync. Cron should hit the same internal route.">
        <form action={runBot} className="internal-form internal-toolbar-form">
          <input name="chainId" placeholder="84532 or 8453" />
          <input name="limit" type="number" min="1" max="25" defaultValue="10" />
          <label className="internal-check"><input name="force" type="checkbox" /> Force run</label>
          <button type="submit" className="primary">Run bot</button>
        </form>
      </InternalCommandPanel>

      <InternalTable
        columns={["title", "status", "resolution", "verification", "confidence", "outcome", "close", "mode", "deadline", "id", "contract", "evidence", "claim", "source", "error", "actions"]}
        primaryColumn="title"
        secondaryColumns={["status", "resolution", "verification", "outcome"]}
        metricColumns={["close", "mode", "deadline"]}
        detailColumns={["id", "contract", "evidence", "claim", "source", "error"]}
        statusColumn="resolution"
        rows={rows.map((row) => ({
          ...row,
          actions: (
            <div className="internal-action-stack">
              <form action={verifyResult} className="internal-inline-form">
                <input type="hidden" name="marketId" value={row.id} />
                <label className="internal-check"><input name="force" type="checkbox" /> Force</label>
                <label className="internal-check"><input name="autoQueue" type="checkbox" /> Auto queue</label>
                <button type="submit">Verify source</button>
              </form>
              <form action={approveVerifiedResult} className="internal-inline-form">
                <input type="hidden" name="marketId" value={row.id} />
                <select name="outcome" defaultValue={String(row.outcome || "ride")}>
                  <option value="">Use provisional</option>
                  <option value="ride">Ride</option>
                  <option value="fade">Fade</option>
                  <option value="invalid">Invalid / refund</option>
                </select>
                <textarea name="evidenceText" placeholder="Final ProofFlow reason" defaultValue={row.claim || ""} />
                <input name="sourceUrl" placeholder="Source used" defaultValue={row.source || ""} />
                <button type="submit">Finalize ProofFlow</button>
              </form>
              <form action={submitProvisional} className="internal-inline-form">
                <input type="hidden" name="marketId" value={row.id} />
                <select name="outcome" defaultValue={String(row.outcome || "ride")}>
                  <option value="ride">Ride</option>
                  <option value="fade">Fade</option>
                  <option value="invalid">Invalid</option>
                </select>
                <textarea
                  name="claim"
                  placeholder="ProofFlow evidence with source, result and timestamp"
                  defaultValue={row.claim || (row.source ? `NexMarkets market \"${row.title}\" resolves according to ${row.source}.` : "")}
                />
                <button type="submit">Submit provisional</button>
              </form>
            </div>
          )
        }))}
      />

      <InternalTable
        columns={["created", "status", "market", "panel", "prover", "reason", "details", "moderation", "actions"]}
        primaryColumn="market"
        secondaryColumns={["status", "reason", "prover"]}
        metricColumns={["created", "panel"]}
        detailColumns={["details", "moderation"]}
        statusColumn="status"
        rows={conflictReports.map((report) => ({
          created: report.createdAt.toISOString(),
          status: report.status,
          market: report.marketId,
          panel: report.panelId || "-",
          prover: report.reviewerWallet || "-",
          reason: report.reason.replace(/_/g, " "),
          details: report.details || "-",
          moderation: report.moderationNote || "-",
          actions: report.status === "PENDING" ? (
            <div className="internal-action-stack">
              <form action={reviewConflictReport} className="internal-inline-form">
                <input type="hidden" name="reportId" value={report.id} />
                <input type="hidden" name="action" value="confirm" />
                <input name="moderatorWallet" placeholder="Moderator wallet" />
                <textarea name="moderationNote" placeholder="Why this conflict is confirmed" />
                <button type="submit">Confirm conflict</button>
              </form>
              <form action={reviewConflictReport} className="internal-inline-form">
                <input type="hidden" name="reportId" value={report.id} />
                <input type="hidden" name="action" value="dismiss" />
                <input name="moderatorWallet" placeholder="Moderator wallet" />
                <textarea name="moderationNote" placeholder="Why this report is dismissed" />
                <button type="submit">Dismiss report</button>
              </form>
            </div>
          ) : report.status
        }))}
      />
    </InternalAdminPage>
  );
}
