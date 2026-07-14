"use client";

import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/product/Icon";
import { EmptyState, LoadState } from "@/components/product/LoadState";
import { useProduct } from "@/components/product/ProductProvider";
import { formatDate, formatUsdcAtomic, greeting } from "@/components/product/format";

type ActivityRow = {
  id: string;
  icon: IconName;
  eyebrow: string;
  title: string;
  copy: string;
  status: string;
  meta: string;
  href: string;
};

export function DashboardPage() {
  const router = useRouter();
  const { data, loading, error, refresh, notify, walletConnected, setConnectWalletOpen } = useProduct();
  if (loading || error || !data) return <LoadState />;
  if (!data.authenticated) return <GuestStart />;

  const name = data.user?.displayName || data.user?.handle || "there";
  const rows: ActivityRow[] = [
    ...data.creations.slice(0, 3).map((item) => ({ id: `creation:${item.id}`, icon: "studio" as const, eyebrow: "Studio", title: item.title, copy: item.headline || item.status, status: item.status.replaceAll("_", " ").toLowerCase(), meta: formatDate(item.edited), href: `/studio/${item.id}` })),
    ...data.myWork.slice(0, 5).map((item) => ({ id: item.id, icon: item.route === "workroom" ? "workroom" as const : "market" as const, eyebrow: item.side, title: item.title, copy: item.detail, status: item.status, meta: formatDate(item.submitted), href: item.route === "workroom" ? `/workrooms/${item.entityId}` : "/marketplace?tab=my-work" })),
    { id: "reputation", icon: "reputation", eyebrow: "NexCard", title: data.reputation ? "Your NexCard record is available" : "Your NexCard has not been created", copy: data.reputation ? "Open Reputation to review the persisted profile and its source evidence." : "Connect X when you are ready to build it from real public account data.", status: data.reputation ? data.reputation.status.replaceAll("_", " ").toLowerCase() : "Set up", meta: data.reputation ? formatDate(data.reputation.updatedAt) : "Not started", href: "/reputation" },
  ];
  const next = rows[0];
  const connect = async () => {
    if (walletConnected) {
      try {
        await refresh();
        notify("Balances refreshed", "Your wallet balance was updated.");
      } catch (reason) {
        notify("Refresh failed", reason instanceof Error ? reason.message : "Balances could not be fetched.");
      }
    } else {
      setConnectWalletOpen(true);
    }
  };

  return <section className="account-dashboard">
    <header className="account-dashboard-head">
      <div className="account-dashboard-intro"><span className="page-kicker">Dashboard</span><h1>{greeting()}, {name}.</h1><p>{next ? `${next.title} · ${next.copy}` : "Your account is ready. Start a creation, post work or build your NexCard."}</p></div>
      <aside className="balance-brief"><span>Available balance</span><div><strong>{walletConnected ? formatUsdcAtomic(data.wallet.usdcAtomic) : "-"}</strong><small>USDC</small></div><button className="btn text" onClick={() => void connect()}>{walletConnected ? "Refresh wallet" : "Connect wallet"} <Icon name="arrow" size="sm" /></button></aside>
    </header>
    <nav className="account-actions" aria-label="Start in NexMarkets">
      <button onClick={() => router.push("/studio?mode=video")}><i><Icon name="play" size="sm" /></i><span>Create video</span></button>
      <button onClick={() => router.push("/studio?mode=infographic")}><i><Icon name="studio" size="sm" /></i><span>Create infographic</span></button>
      <button onClick={() => router.push("/marketplace/post")}><i><Icon name="plus" size="sm" /></i><span>Post work</span></button>
      <button onClick={() => router.push("/reputation")}><i><Icon name="reputation" size="sm" /></i><span>Open NexCard</span></button>
    </nav>
    <section className="account-metrics">
      <article><span>Creations</span><strong>{data.creations.length}</strong><small>Persisted Studio records</small></article>
      <article><span>Marketplace</span><strong>{data.myWork.length}</strong><small>Your Listing, application and Workroom records</small></article>
      <article><span>Resources</span><strong>{data.sources.length}</strong><small>Saved sources</small></article>
    </section>
    <div className="section-top account-section-top"><div><span className="page-kicker">Account activity</span><h2>Continue from the real record.</h2></div></div>
    <section className="account-activity">
      {rows.length ? rows.map((item) => <article key={item.id} className="account-activity-row"><i className="activity-mark"><Icon name={item.icon} size="sm" /></i><span className="activity-copy"><small>{item.eyebrow}</small><b>{item.title}</b><span>{item.copy}</span></span><span className="activity-state"><b>{item.status}</b><small>{item.meta}</small></span><button className="btn text activity-action" onClick={() => router.push(item.href)}>Open <Icon name="arrow" size="sm" /></button></article>) : <EmptyState title="No activity yet." text="Your own creations and work records will appear here." />}
    </section>
  </section>;
}

function GuestStart() {
  const router = useRouter();
  const { data } = useProduct();
  if (!data) return null;
  return <section className="guest-start">
    <header className="guest-hero"><span className="page-kicker">NexMarkets</span><h1>What do you need to get done?</h1><p>Choose the work in front of you. Sign in only when it is time to save, fund, publish or apply.</p></header>
    <section className="guest-route-grid">
      <button className="guest-route" onClick={() => router.push("/studio")}><i><Icon name="studio" size="lg" /></i><span><small>Create media</small><h2>Create a video or make information visual.</h2><b>Open Studio <Icon name="arrow" size="sm" /></b></span></button>
      <button className="guest-route" onClick={() => router.push("/reputation")}><i><Icon name="reputation" size="lg" /></i><span><small>Build reputation</small><h2>Turn your X history into a reputation people can use.</h2><b>Create your NexCard <Icon name="arrow" size="sm" /></b></span></button>
      <button className="guest-route" onClick={() => router.push("/marketplace")}><i><Icon name="market" size="lg" /></i><span><small>Find or offer work</small><h2>Browse opportunities, post work or offer a service.</h2><b>Explore Marketplace <Icon name="arrow" size="sm" /></b></span></button>
    </section>
    <div className="section-top"><h2>Open work</h2><span>Browse every Listing without signing in</span></div>
    {data.listings.length ? <section className="guest-listings">{data.listings.slice(0, 3).map((item) => <button key={item.id} className="guest-listing" onClick={() => router.push(`/marketplace/${item.slug}`)}><i>{item.type.slice(0, 2).toUpperCase()}</i><span><small>{item.type} · {item.owner}</small><b>{item.title}</b><em>{item.skills.slice(0, 3).join(" · ") || item.outcome}</em></span><strong>{item.budget}<small>{formatDate(item.deadline)}</small></strong></button>)}</section> : <EmptyState icon="market" title="No open work yet." text="Funded public Listings will appear here as soon as they are published." action={<button className="btn ghost" onClick={() => router.push("/marketplace")}>Open Marketplace</button>} />}
    <section className="guest-showcase"><div><div className="section-top"><h2>Made in Studio</h2><button className="btn text" onClick={() => router.push("/studio")}>Open Studio <Icon name="arrow" size="sm" /></button></div><div className="market-empty"><h2>No public Studio work yet.</h2><p>Published creations will appear here when their owners make them public.</p></div></div><aside className="guest-card-sample"><span className="page-kicker">Public NexCard</span><div className="sample-person"><i>NC</i><span><b>Your professional signal</b><small>Built from verified public evidence</small></span></div><p>NexCard turns public X work into evidence-led reputation while keeping private context under your control.</p><div className="card-tags"><span>Demonstrated skills</span><span>Public work</span><span>Approved context</span></div><button className="btn ghost full" onClick={() => router.push("/reputation")}>See how Reputation works</button></aside></section>
  </section>;
}
