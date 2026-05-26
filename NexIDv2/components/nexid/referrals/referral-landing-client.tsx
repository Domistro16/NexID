"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { REFERRAL_STORAGE_KEY } from "@/lib/referrals";

export function ReferralLandingClient({ code }: { code: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, code);
    setSaved(true);

    void fetch(`/api/referrals/click/${encodeURIComponent(code)}`, { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(() => router.replace(`/mint?ref=${encodeURIComponent(code)}`), 450);
      });
  }, [code, router]);

  return (
    <section className="view active">
      <div className="dash-hero">
        <div className="dash-hero-content">
          <div>
            <div className="eyebrow"><i className="dot" /> Referral saved</div>
            <h1>{saved ? `${code}.id` : "Saving referral."}</h1>
            <p>This referral will stay in this browser and will be passed to NexDomains when you mint a .id name from NexID.</p>
            <div className="hero-ctas">
              <Link className="primary" href={`/mint?ref=${code}`}>Continue to Mint</Link>
              <Link className="btn" href="/narratives">Explore narratives</Link>
            </div>
          </div>
          <aside className="dash-next">
            <span>Stored locally</span>
            <b>{code}.id</b>
            <p>No NexDomains redirect. NexID will include this code when preparing the mint transaction.</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
