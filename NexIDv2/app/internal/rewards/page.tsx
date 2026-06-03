import { revalidatePath } from "next/cache";
import { InternalAdminPage, InternalCommandPanel, InternalTable } from "@/components/internal-admin-page";
import { internalClaimablePayoutUpdateSchema, internalRewardAllocationUpdateSchema } from "@/lib/server/validation";
import { listClaimablePayoutRequests, updateClaimablePayoutRequestAdmin } from "@/lib/services/claimableBalanceService";
import { generateRewardCycle, listRewardRows, rewardSeasonAdminSummary, updateRewardAllocationAdmin } from "@/lib/services/rewardService";

export const dynamic = "force-dynamic";

function usd(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

async function generateCycle() {
  "use server";
  await generateRewardCycle();
  revalidatePath("/internal/rewards");
  revalidatePath("/dashboard");
  revalidatePath("/points");
}

async function updateAllocation(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  const body = internalRewardAllocationUpdateSchema.parse({
    status: formData.get("status") || "pending",
    txHash: String(formData.get("txHash") || "") || undefined,
    note: String(formData.get("note") || "") || undefined
  });
  await updateRewardAllocationAdmin({ id, ...body });
  revalidatePath("/internal/rewards");
  revalidatePath("/dashboard");
  revalidatePath("/points");
}

async function updateClaimRequest(formData: FormData) {
  "use server";
  const referenceId = String(formData.get("referenceId") || "");
  const body = internalClaimablePayoutUpdateSchema.parse({
    status: formData.get("status") || "paid",
    txHash: String(formData.get("txHash") || "") || undefined
  });
  await updateClaimablePayoutRequestAdmin({ referenceId, ...body });
  revalidatePath("/internal/rewards");
  revalidatePath("/dashboard");
}

export default async function InternalRewardsPage() {
  const [rows, claims, summary] = await Promise.all([listRewardRows(), listClaimablePayoutRequests(), rewardSeasonAdminSummary()]);
  return (
    <InternalAdminPage
      title=".id Rewards"
      eyebrow="Weekly loyalty pool"
      deck="Generate weekly allocations from NexID fees, review abuse flags, and monitor distributor-backed reward claims. Clean rewards are automatic; wallets without .id stay locked until the user mints one."
      stats={[
        { label: "Season", value: summary.code, note: summary.status },
        { label: "Reward pool", value: usd(summary.rewardPoolUsd), note: `${usd(summary.tradingRevenueUsd)} trading / ${usd(summary.mintRevenueUsd)} mints` },
        { label: "Pending", value: usd(summary.pendingUsd), note: `${summary.allocationCount} allocations` },
        { label: "Paid", value: usd(summary.paidUsd), note: `${summary.reviewCount} needs review` }
      ]}
    >
      <InternalCommandPanel title="Generate reward cycle" description="Rebuild this season from fee ledgers, receipts, levels and anti-gaming signals." defaultOpen>
        <form action={generateCycle} className="internal-form internal-toolbar-form">
          <button type="submit" className="primary">Generate weekly allocations</button>
        </form>
      </InternalCommandPanel>
      <InternalTable
        columns={["id", "identity", "rank", "level", "badge", "score", "volume", "fees", "profit", "reward", "status", "risk", "payout", "txHash", "actions"]}
        primaryColumn="identity"
        secondaryColumns={["rank", "level", "status"]}
        metricColumns={["reward", "score", "volume", "fees", "profit"]}
        detailColumns={["id", "badge", "risk", "payout", "txHash"]}
        statusColumn="status"
        emptyText="No reward allocations yet. Generate the current season after fee ledgers exist."
        rows={rows.map((row) => ({
          ...row,
          actions: (
            <form action={updateAllocation} className="internal-inline-form">
              <input name="id" type="hidden" value={String(row.id)} />
              <select name="status" defaultValue={String(row.status)}>
                <option value="pending">pending</option>
                <option value="review">review</option>
                <option value="approved">approved</option>
                <option value="locked_id_required">locked_id_required</option>
                <option value="paid">paid</option>
                <option value="blocked">blocked</option>
              </select>
              <input name="txHash" defaultValue={String(row.txHash || "")} placeholder="Payout tx hash" />
              <input name="note" placeholder="Operator note" />
              <button type="submit">Update reward</button>
            </form>
          )
        }))}
      />
      <InternalTable
        columns={["referenceId", "identity", "amount", "sources", "status", "destination", "txHash", "createdAt", "actions"]}
        primaryColumn="identity"
        secondaryColumns={["amount", "status"]}
        metricColumns={["amount"]}
        detailColumns={["referenceId", "sources", "destination", "txHash", "createdAt"]}
        statusColumn="status"
        emptyText="No claimable balance payout requests yet."
        rows={claims.map((claim) => ({
          ...claim,
          actions: claim.status === "claim_requested" ? (
            <form action={updateClaimRequest} className="internal-inline-form">
              <input name="referenceId" type="hidden" value={String(claim.referenceId)} />
              <select name="status" defaultValue="paid">
                <option value="paid">paid</option>
                <option value="released">release back</option>
              </select>
              <input name="txHash" defaultValue={String(claim.txHash || "")} placeholder="Payout tx hash" />
              <button type="submit">Update claim</button>
            </form>
          ) : "Closed"
        }))}
      />
    </InternalAdminPage>
  );
}
