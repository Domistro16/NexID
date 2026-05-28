import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { shortWalletAddress } from "@/lib/identity";
import { getPublicPassportProfile } from "@/lib/services/passportProfileService";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const profile = await getPublicPassportProfile(name);
  return {
    title: profile ? `${profile.name} | NexMarkets Passport` : "Passport | NexMarkets",
    description: profile ? `${profile.identity} NexMarkets public passport.` : "Public NexMarkets .id passport."
  };
}

export default async function PublicPassportPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const profile = await getPublicPassportProfile(name);
  if (!profile) notFound();

  return (
    <NexidAppShell>
      <section className="view active">
        <div className="id-status-card">
          <span className="pill">Public Passport</span>
          <h2>{profile.name}</h2>
          <p>{profile.identity} carries receipts, EdgeBoard performance, creator reputation, and referral history through NexMarkets.</p>
        </div>
        <section className="section dash-stat-row">
          <div className="dash-stat"><span>Wallet</span><b>{shortWalletAddress(profile.walletAddress)}</b></div>
          <div className="dash-stat"><span>Points</span><b>{profile.pointsTotal}</b></div>
          <div className="dash-stat"><span>Edge</span><b>{profile.edgeScoreTotal}</b></div>
          <div className="dash-stat"><span>Badge</span><b>{profile.rewardBadge}</b></div>
        </section>
        <section className="section">
          <div className="section-head">
            <div>
              <div className="eyebrow"><i className="dot" /> Receipts</div>
              <h2>Public proof.</h2>
            </div>
          </div>
          {profile.receipts.length ? (
            <div className="receipt-archive">
              {profile.receipts.map((receipt) => (
                <div className="receipt-archive-card" key={receipt.id}>
                  <h3>{receipt.result}</h3>
                  <p>{receipt.title}</p>
                  <span>{receipt.points} pts</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No public receipts yet</h3>
              <p>Receipts will appear after this passport has real settled product activity.</p>
            </div>
          )}
        </section>
      </section>
    </NexidAppShell>
  );
}
