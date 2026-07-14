"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/product/Icon";
import { LoadState } from "@/components/product/LoadState";
import { useProduct } from "@/components/product/ProductProvider";
import type { ReputationView } from "@/components/product/types";
import { NexCard } from "./NexCard";
import { compactNumber, metricTotal, reputationData, topicShares } from "./reputation-data";

function nexBalance(atomic: string | null) {
  if (!atomic) return 0;
  try { return Number(BigInt(atomic) / 10n ** 18n); } catch { return 0; }
}

export function ReputationPage() {
  const router = useRouter();
  const { data, loading, error, api, refresh, connectWallet, notify, setSignInOpen } = useProduct();
  const [working, setWorking] = useState(false);
  if (loading || error || !data) return <LoadState label="Loading NexCard" />;

  const connectX = async () => {
    try {
      if (!data.authenticated) {
        setSignInOpen(true);
        return;
      }
      window.location.assign("/api/v1/x/connect");
    } catch (reason) { notify("Connection needed", reason instanceof Error ? reason.message : "Sign in before connecting X."); }
  };

  const analyse = async () => {
    setWorking(true);
    try { await api<ReputationView>("/api/v1/reputation/analyse", { method: "POST", body: "{}" }); await refresh(); notify("NexCard ready", "Your current public X record has been analysed and stored."); }
    catch (reason) { notify("X analysis failed", reason instanceof Error ? reason.message : "The public account could not be analysed."); }
    finally { setWorking(false); }
  };

  if (!data.integrations.x.connected || !data.reputation) return <section className="signal-entry signal-entry-welcome">
    <div className="signal-entry-copy"><span className="page-kicker">NEXCARD</span><h1>Let your public work speak before you have to explain it.</h1><p>Connect X to turn the work, ideas and conversations already visible on your account into a clear signal people can understand and share.</p><div className="signal-entry-actions">{data.integrations.x.connected ? <button className="btn primary" disabled={working} onClick={analyse}>{working ? "Reading public activity…" : "Create my NexCard"} <Icon name="arrow" size="sm" /></button> : <button className="btn primary" onClick={connectX}>Connect X to begin <Icon name="arrow" size="sm" /></button>}<button className="btn ghost" onClick={() => router.push("/docs/reputation--how-the-base-nexcard-is-built")}>See what NexMarkets checks</button></div><div className="signal-entry-assurance"><i><Icon name="check" size="sm" /></i><span><b>You review the card before anything becomes public.</b><small>NexMarkets never requests direct messages, drafts, bookmarks or private lists.</small></span></div></div>
    <aside className="signal-entry-preview" aria-label="Preview of a base NexCard"><header><span>YOUR PUBLIC SIGNAL</span><small>LAST 90 DAYS</small></header><div className="signal-preview-person"><i>𝕏</i><span><b>Your X profile</b><small>Name · handle · location · account history</small></span></div><div className="signal-preview-grid"><article><span>Reach</span><i /></article><article><span>Conversation</span><i /></article><article><span>Consistency</span><i /></article><article><span>Topics</span><i /></article></div><footer><span>No job title written for you.</span><b>No public score.</b></footer></aside>
    <div className="signal-source-line"><article><span>01</span><div><b>X supplies the public record</b><small>Profile details, recent posts and the response around them.</small></div></article><article><span>02</span><div><b>You add the missing context</b><small>Your role, availability and the work you want next.</small></div></article><article><span>03</span><div><b>NexMarkets adds completed work</b><small>Only Marketplace delivery approved by the hiring side.</small></div></article></div>
  </section>;

  if (working) return <ReputationAnalysis />;
  return <ReputationCardPage profile={data.reputation} onRefresh={analyse} />;
}

function ReputationAnalysis() {
  const steps = [["Profile and account history", "Name, handle, profile image, location and account age"], ["Recent public posts", "The last 90 days of posts and linked public work"], ["Reach and conversation", "Impressions, replies, reposts and quotes"], ["Recurring topics", "The subjects that keep returning across the account"], ["Standout posts", "The posts that travelled furthest or started real discussion"], ["Base NexCard", "A shareable snapshot prepared for your review"]];
  return <section className="signal-analysis"><header><span className="page-kicker">X ANALYSIS</span><h1>Reading the public account, not writing a biography.</h1><p>NexMarkets is organising what X can actually show. Your role, availability and professional direction are left open for you.</p></header><div className="signal-analysis-progress"><i style={{ "--progress": "72%" } as React.CSSProperties} /></div><div className="signal-analysis-layout"><main>{steps.map(([label, copy], index) => <article className={index === 0 ? "ready" : "waiting"} key={label}><span>{index === 0 ? <Icon name="check" size="sm" /> : String(index + 1).padStart(2, "0")}</span><div><b>{label}</b><small>{copy}</small></div><em>{index === 0 ? "Reading" : "Waiting"}</em></article>)}</main><aside><span>WINDOW</span><strong>90 days</strong><p>Nothing is public until you open and share the finished card.</p></aside></div></section>;
}

function ReputationCardPage({ profile, onRefresh }: { profile: ReputationView; onRefresh: () => Promise<void> }) {
  const router = useRouter();
  const { data, api, refresh, connectWallet, notify } = useProduct();
  const [publishing, setPublishing] = useState(false);
  const { identity, analysis, enhanced, settings, visibility } = reputationData(profile);
  const isEnhanced = profile.status === "ENHANCED_CARD_READY";
  const balance = nexBalance(data?.wallet.nexAtomic || null);
  const eligible = balance >= 50_000;
  const published = settings.published === true;
  const topics = topicShares(analysis.topics);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/profile/${profile.publicSlug}`;
  const copy = async () => { await navigator.clipboard.writeText(url); notify("Link copied", "The public NexCard link is on your clipboard."); };
  const share = async () => { if (navigator.share) await navigator.share({ title: `${identity.name || profile.handle} · NexCard`, url }); else await copy(); };
  const publishBase = async () => {
    setPublishing(true);
    try { await api("/api/v1/reputation/publish", { method: "POST", body: JSON.stringify({ mode: "base" }) }); await refresh(); notify("NexCard published", "The public profile now reflects only the verified base X analysis."); }
    catch (reason) { notify("Publish failed", reason instanceof Error ? reason.message : "The NexCard could not be published."); }
    finally { setPublishing(false); }
  };
  const enhance = async () => {
    try {
      if (!data?.wallet.address) await connectWallet();
      if (!eligible) { router.push("/nex"); return; }
      if (!data?.integrations.nexmind.configured) throw new Error("NexMind must be configured before a live enhancement session can start.");
      router.push(`/nexmind?purpose=reputation&profile=${profile.id}`);
    } catch (reason) { notify("Enhancement unavailable", reason instanceof Error ? reason.message : "The session could not start."); }
  };
  const download = () => {
    const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 900; const context = canvas.getContext("2d"); if (!context) return;
    context.fillStyle = "#101010"; context.fillRect(0, 0, 1600, 900); context.fillStyle = "#d2a84a"; context.fillRect(0, 0, 24, 900); context.fillStyle = "#f4efe3"; context.font = "700 34px system-ui"; context.fillText("NEXCARD", 90, 100); context.font = "700 82px system-ui"; context.fillText(identity.name || profile.handle, 90, 260); context.font = "32px system-ui"; context.fillStyle = "#c9c4b8"; context.fillText(`@${identity.username || profile.handle} · ${identity.location || ""}`, 90, 325); context.font = "42px system-ui"; context.fillStyle = "#f4efe3"; const line = typeof enhanced.workLine === "string" && visibility.workLine ? enhanced.workLine : identity.description || "Public activity from X"; context.fillText(line.slice(0, 62), 90, 445); context.fillStyle = "#d2a84a"; context.font = "700 100px system-ui"; context.fillText(compactNumber(analysis.totals?.impressions), 90, 670); context.fillStyle = "#c9c4b8"; context.font = "28px system-ui"; context.fillText("RECENT PUBLIC IMPRESSIONS", 90, 715); const anchor = document.createElement("a"); anchor.href = canvas.toDataURL("image/png"); anchor.download = `${profile.publicSlug}-nexcard.png`; anchor.click();
  };
  const posts = analysis.standout || [];
  return <><header className="signal-page-head"><div><span className="page-kicker">NEXCARD</span><h1>{isEnhanced ? "X showed the pattern. You added the work behind it." : "Here is what your X activity shows."}</h1><p>{isEnhanced ? "Your reviewed role, availability and preferred work now sit alongside the public activity people can already see." : "Reach, conversation, consistency and recurring topics—without inventing a role, expertise or availability."}</p></div><button className="btn ghost" onClick={() => void onRefresh()}><Icon name="refresh" size="sm" /> Refresh X data</button></header><section className="signal-card-layout"><main><div className="signal-card-frame"><NexCard profile={profile} /></div><div className="signal-card-actions">{published ? <button className="btn primary" onClick={() => router.push(`/profile/${profile.publicSlug}`)}>Open public profile <Icon name="arrow" size="sm" /></button> : <button className="btn primary" disabled={publishing} onClick={publishBase}>{publishing ? "Publishing…" : "Publish base NexCard"} <Icon name="arrow" size="sm" /></button>}<button className="btn ghost" disabled={!published} onClick={copy}><Icon name="copy" size="sm" /> Copy link</button><button className="btn ghost" onClick={download}><Icon name="download" size="sm" /> Download card</button><button className="btn ghost" disabled={!published} onClick={share}><Icon name="share" size="sm" /> Share</button></div><section className="signal-patterns"><header><span>{isEnhanced ? "AVAILABLE WORK" : "TOPICS"}</span><h2>{isEnhanced ? "What this person wants to be hired for." : "What appears most often in the account."}</h2></header><div>{topics.map((topic, index) => <article className={isEnhanced ? "signal-capability-row" : "signal-topic-row"} key={topic.name}><strong>{isEnhanced ? String(index + 1).padStart(2, "0") : `${topic.share}%`}</strong><div><h3>{topic.name}</h3><p>{topic.count} public references in the analysed window.</p></div></article>)}</div></section><details className="signal-posts"><summary><span>Posts behind this snapshot</span><small>{posts.length} standout posts from {analysis.tweetsChecked || 0} data points checked</small></summary><div>{posts.map((post, index) => <article key={post.id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{post.text}</b><small>{compactNumber(metricTotal(post.metrics))} public interactions</small></div>{post.url ? <a className="btn text" href={post.url} target="_blank" rel="noreferrer">View</a> : null}</article>)}</div></details></main><aside className="signal-card-rail signal-card-rail-v3"><section className={isEnhanced ? "signal-card-status signal-card-status-published" : "signal-context-card"}><span>{isEnhanced ? "PUBLIC PROFILE" : "ADD YOUR CONTEXT"}</span><h2>{isEnhanced ? identity.name || profile.handle : "Add what X cannot know."}</h2><p>Speak with NexMind to confirm your role, availability and preferred work so the profile can match you more accurately.</p><div className="signal-access"><b>{data?.wallet.address ? `${balance.toLocaleString()} $NEX detected` : "Wallet not connected"}</b><small>{eligible ? "Profile enhancement is available now." : "50,000 $NEX is required · no staking or locking"}</small></div><button className={isEnhanced ? "btn ghost full" : "btn primary full"} onClick={enhance}><Icon name="mic" size="sm" /> {isEnhanced ? "Enhance profile details" : "Speak with NexMind"}</button>{!isEnhanced ? <ul><li>Confirm your role</li><li>Choose the work you want</li><li>Decide what appears publicly</li></ul> : null}</section></aside></section></>;
}
