import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { absoluteUrl, pageSeo } from "@/lib/seo";
import { getPublicProverProfile } from "@/lib/services/proofFlowProverService";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ identifier: string }> }): Promise<Metadata> {
  const { identifier } = await params;
  const profile = await getPublicProverProfile(decodeURIComponent(identifier));
  if (!profile) {
    return pageSeo({
      title: "Prover Not Found | NexMarkets",
      description: "This public ProofFlow Prover profile could not be found.",
      path: `/provers/${encodeURIComponent(identifier)}`,
      noIndex: true
    });
  }
  return pageSeo({
    title: `${profile.displayName} ProofFlow Prover | NexMarkets`,
    description: `Public ProofFlow Prover profile for ${profile.idName ?? profile.walletAddress}, including reputation, accuracy, assignments, and Genesis status.`,
    path: `/provers/${encodeURIComponent(identifier)}`
  });
}

function shortWallet(walletAddress: string) {
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

function ProverStructuredData({ profile }: { profile: NonNullable<Awaited<ReturnType<typeof getPublicProverProfile>>> }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": absoluteUrl(`/provers/${encodeURIComponent(profile.idName ?? profile.walletAddress)}#profile`),
    name: `${profile.displayName} ProofFlow Prover`,
    url: absoluteUrl(`/provers/${encodeURIComponent(profile.idName ?? profile.walletAddress)}`),
    mainEntity: {
      "@type": "Person",
      name: profile.displayName,
      identifier: profile.walletAddress,
      description: profile.publicBio ?? "Validates disputed NexMarkets outcomes through ProofFlow consensus."
    }
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export default async function ProverProfilePage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const profile = await getPublicProverProfile(decodeURIComponent(identifier));
  if (!profile) notFound();

  return (
    <main className="prover-profile-page">
      <ProverStructuredData profile={profile} />
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
