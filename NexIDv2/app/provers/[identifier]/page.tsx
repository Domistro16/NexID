import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProverProfile } from "@/lib/services/proofFlowProverService";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ identifier: string }> }): Promise<Metadata> {
  const { identifier } = await params;
  const profile = await getPublicProverProfile(decodeURIComponent(identifier));
  if (!profile) return { title: "Prover not found | NexMarkets" };
  return {
    title: `${profile.displayName} | ProofFlow Prover`,
    description: `Public ProofFlow Prover profile for ${profile.idName ?? profile.walletAddress}.`
  };
}

function shortWallet(walletAddress: string) {
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

export default async function ProverProfilePage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const profile = await getPublicProverProfile(decodeURIComponent(identifier));
  if (!profile) notFound();

  return (
    <main className="prover-profile-page">
      <section className="prover-profile-hero">
        <div className="prover-profile-shell">
          <div className="prover-profile-mark" aria-hidden="true">
            {(profile.displayName || profile.walletAddress).slice(0, 2).toUpperCase()}
          </div>
          <div className="prover-profile-copy">
            <div className="prover-profile-kicker">
              {profile.genesisBadge ? <span>Genesis Prover</span> : <span>ProofFlow Prover</span>}
              <i>{profile.status}</i>
            </div>
            <h1>{profile.displayName}</h1>
            <p>{profile.publicBio ?? "Validates disputed NexMarkets outcomes through ProofFlow consensus."}</p>
            <div className="prover-profile-address">
              <b>{profile.idName ?? "No .id linked"}</b>
              <span>{shortWallet(profile.walletAddress)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="prover-profile-grid" aria-label="Prover statistics">
        <article>
          <span>Reputation</span>
          <b>{profile.reputation.toLocaleString("en-US")}</b>
        </article>
        <article>
          <span>Accuracy</span>
          <b>{profile.accuracy.toFixed(1)}%</b>
        </article>
        <article>
          <span>Completed Settlements</span>
          <b>{profile.completedSettlements.toLocaleString("en-US")}</b>
        </article>
        <article>
          <span>Assignments</span>
          <b>{profile.totalAssignments.toLocaleString("en-US")}</b>
        </article>
      </section>
    </main>
  );
}
