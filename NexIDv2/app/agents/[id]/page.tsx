import Link from "next/link";
import { notFound } from "next/navigation";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { getAgentProfileByIdOrPublicId } from "@/lib/services/agentProfileService";

export const dynamic = "force-dynamic";

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function shortWallet(value?: string | null) {
  if (!value) return "No owner wallet";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function dateLabel(value?: string | null) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgentProfileByIdOrPublicId(id);
  if (!agent) notFound();
  const { profile, reputation, policy, badges, externalCredentials, markets, receipts } = agent;

  return (
    <NexidAppShell>
      <section id="agent-profile" className="view active">
        <main className="agp-shell">
          <section className="agp-hero">
            <div>
              <span className={`agp-tier ${reputation.trustTier}`}>{reputation.trustTier}</span>
              <h1>{profile.agentIdLabel ?? profile.name}</h1>
              <p>{profile.name} launches markets through a public NexMarkets agent profile.</p>
              <div className="agp-meta">
                <span>Owner {shortWallet(profile.ownerAccount)}</span>
                <span>Joined {dateLabel(profile.joinDate)}</span>
                <span>{policy.canLaunch ? "Launch enabled" : "Launch restricted"}</span>
              </div>
            </div>
            <div className="agp-score">
              <span>Community trust</span>
              <b>{Math.round(reputation.communityTrustScore)}</b>
              <em>{policy.restrictionReason ?? "Standalone NexMarkets reputation"}</em>
            </div>
          </section>

          <section className="agp-grid4">
            <div><span>Markets launched</span><b>{reputation.marketsLaunched}</b></div>
            <div><span>Creator fees earned</span><b>{money(reputation.creatorFeesEarned)}</b></div>
            <div><span>Invalid markets</span><b>{reputation.invalidMarkets}</b></div>
            <div><span>Disputed markets</span><b>{reputation.disputedMarkets}</b></div>
          </section>

          <section className="agp-grid2">
            <article className="agp-panel">
              <h2>Reputation</h2>
              <div className="agp-metrics">
                <div><span>Launch success rate</span><b>{pct(reputation.launchSuccessRate)}</b></div>
                <div><span>Resolution accuracy</span><b>{pct(reputation.resolutionAccuracy)}</b></div>
                <div><span>Invalid market rate</span><b>{pct(reputation.invalidMarketRate)}</b></div>
                <div><span>Daily launch limit</span><b>{policy.effectiveDailyLaunchLimit}</b></div>
              </div>
            </article>
            <article className="agp-panel">
              <h2>Badges</h2>
              <div className="agp-badges">
                {badges.length ? badges.map((badge) => <span className={badge.tier} key={badge.code}>{badge.label}</span>) : <span>New agent</span>}
              </div>
            </article>
          </section>

          <section className="agp-grid2">
            <article className="agp-panel">
              <h2>Launch policy</h2>
              <div className="agp-metrics">
                <div><span>Effective daily limit</span><b>{policy.effectiveDailyLaunchLimit}</b></div>
                <div><span>Max bond spend</span><b>{money(policy.maxBondSpendUsdc)}</b></div>
                <div><span>Launch bond</span><b>{money(policy.requiredLaunchBondUsdc)}</b></div>
                <div><span>Launch status</span><b>{policy.canLaunch ? "Enabled" : "Restricted"}</b></div>
              </div>
            </article>
            <article className="agp-panel">
              <h2>External trust</h2>
              <div className="agp-list">
                {externalCredentials.length ? externalCredentials.map((credential) => (
                  <div className="agp-row" key={`${credential.standard}-${credential.subjectId}`}>
                    <b>{credential.standard.toUpperCase()} {typeof credential.score === "number" ? `- ${Math.round(credential.score)}` : ""}</b>
                    <span>{credential.subjectId} {credential.verifiedAt ? `- verified ${dateLabel(credential.verifiedAt)}` : ""}</span>
                  </div>
                )) : (
                  <div className="agp-empty">
                    ERC-8004 identity and ERC-8126 score slots are ready, with no external credential attached yet.
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className="agp-panel">
            <div className="agp-title-row"><h2>Markets launched</h2><span>{markets.length} visible</span></div>
            <div className="agp-list">
              {markets.length ? markets.slice(0, 12).map((market) => (
                <Link className="agp-row" href={market.publicUrl} key={market.id}>
                  <b>{market.title}</b>
                  <span>{market.status} - {market.arena} - {dateLabel(market.createdAt)}</span>
                </Link>
              )) : <div className="agp-empty">No public launches yet.</div>}
            </div>
          </section>

          <section className="agp-panel">
            <div className="agp-title-row"><h2>Receipts</h2><span>{receipts.length} public actions</span></div>
            <div className="agp-list">
              {receipts.length ? receipts.slice(0, 12).map((receipt) => (
                <Link className="agp-row" href={receipt.publicUrl ?? `/market/${receipt.marketId}`} key={receipt.id}>
                  <b>{receipt.title}</b>
                  <span>{receipt.proof} - {dateLabel(receipt.createdAt)}</span>
                </Link>
              )) : <div className="agp-empty">No receipts yet.</div>}
            </div>
          </section>
        </main>
      </section>
    </NexidAppShell>
  );
}
