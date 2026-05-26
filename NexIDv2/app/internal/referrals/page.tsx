import { revalidatePath } from "next/cache";
import { InternalAdminPage, InternalTable } from "@/components/internal-admin-page";
import { getReferralRows } from "@/lib/internal/admin-data";
import { updateReferralAdmin } from "@/lib/services/internalAdminService";

export const dynamic = "force-dynamic";

async function updateReferral(formData: FormData) {
  "use server";
  await updateReferralAdmin(String(formData.get("id") || ""), {
    status: String(formData.get("status") || "pending"),
    riskFlag: String(formData.get("riskFlag") || "") || null
  });
  revalidatePath("/internal/referrals");
  revalidatePath("/dashboard");
}

export default async function InternalReferralsPage() {
  const rows = await getReferralRows();
  const pending = rows.filter((row) => row.status === "pending").length;
  const paid = rows.filter((row) => row.status === "paid").length;
  const risk = rows.filter((row) => row.risk !== "Normal").length;
  return (
    <InternalAdminPage
      title="Referral Review"
      eyebrow="Attribution and payout safety"
      deck="Referral review now surfaces payout state and risk first. Referral ids are hidden in audit details until an operator needs to trace a record."
      stats={[
        { label: "Referrals", value: rows.length, note: "Latest attribution rows" },
        { label: "Pending", value: pending, note: "Needs review" },
        { label: "Paid", value: paid, note: "Completed reward" },
        { label: "Risk flags", value: risk, note: "Blocked or suspicious" }
      ]}
    >
      <InternalTable
        columns={["id", "referrer", "referred", "clicks", "signups", "mints", "pending", "status", "risk", "actions"]}
        primaryColumn="referrer"
        secondaryColumns={["status", "risk"]}
        metricColumns={["referred", "clicks", "signups", "mints", "pending"]}
        detailColumns={["id"]}
        statusColumn="status"
        rows={rows.map((row) => ({
          ...row,
          actions: (
            <form action={updateReferral} className="internal-inline-form">
              <input name="id" type="hidden" value={String(row.id)} />
              <select name="status" defaultValue={String(row.status)}><option>pending</option><option>approved</option><option>paid</option><option>blocked</option></select>
              <input name="riskFlag" defaultValue={row.risk === "Normal" ? "" : String(row.risk)} placeholder="Risk flag" />
              <button type="submit">Update</button>
            </form>
          )
        }))}
      />
    </InternalAdminPage>
  );
}
