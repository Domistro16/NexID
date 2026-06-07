"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { marketOriginDetail, toTitleLabel } from "@/components/nexmarkets/copy";
import { compactUsd } from "@/components/nexmarkets/market-ui";
import type { PublicMarketActivity } from "@/lib/services/marketActivityService";
import { fetchMarketCommentsApi, postMarketCommentApi, type MarketComment } from "@/lib/services/nexid-client";
import type { NexMarket } from "@/lib/types/nexmarkets";

type DetailTab = "activity" | "comments" | "traders" | "rules" | "receipts";

const TABS: Array<{ key: DetailTab; label: string }> = [
  { key: "activity", label: "Activity" },
  { key: "comments", label: "Comments" },
  { key: "traders", label: "Traders" },
  { key: "rules", label: "Rules" },
  { key: "receipts", label: "Receipts" }
];

function sourceLabel(value?: string | null) {
  if (!value) return "Source pending";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "Open";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Open";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  });
}

function formatActivityTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "recent";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  });
}

function priceLabel(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "Live";
  return `${Math.round(value * 100)}¢`;
}

function profileHref(identity: string) {
  return `/id/${encodeURIComponent(identity)}`;
}

function isIdName(identity: string) {
  return /\.id$/i.test(identity.trim());
}

function EmptyInline({ title, copy }: { title: string; copy: string }) {
  return <div className="v40-empty-inline"><b>{title}</b><p>{copy}</p></div>;
}

function IdentityName({ identity }: { identity: string }) {
  return (
    <Link className={`v40-id-name ${isIdName(identity) ? "is-id" : ""}`} href={profileHref(identity)}>
      {identity}
    </Link>
  );
}

function ProfileButton({ identity }: { identity: string }) {
  return <Link className="btn" href={profileHref(identity)}>Profile</Link>;
}

function ActivityTab({ market, activity }: { market: NexMarket; activity: PublicMarketActivity }) {
  const rows = [
    ...activity.trades.map((trade) => ({
      id: `trade:${trade.id}`,
      identity: trade.identity,
      detail: `${trade.side === "ride" ? "Ride" : "Fade"} - ${formatActivityTime(trade.createdAt)}`,
      metric: compactUsd(trade.amount),
      price: priceLabel(trade.entryPrice),
      status: toTitleLabel(trade.status),
      sortTime: trade.createdAt
    })),
    ...activity.receipts.map((receipt) => ({
      id: `receipt:${receipt.id}`,
      identity: receipt.identity,
      detail: `${receipt.title} - ${formatActivityTime(receipt.createdAt)}`,
      metric: toTitleLabel(receipt.side),
      price: market.origin === "native" ? "Native" : "Routed",
      status: receipt.proof,
      sortTime: receipt.createdAt
    }))
  ].sort((a, b) => Date.parse(b.sortTime) - Date.parse(a.sortTime)).slice(0, 8);

  if (!rows.length) {
    return <EmptyInline title="No live activity yet." copy="Trades, launches and receipts will appear here after they are recorded." />;
  }

  return (
    <>
      {rows.map((row) => (
        <div className="v40-row" key={row.id}>
          <div><b><IdentityName identity={row.identity} /></b><span>{row.detail}</span></div>
          <span>{row.metric}</span>
          <span>{row.price}</span>
          <b>{row.status}</b>
          <ProfileButton identity={row.identity} />
        </div>
      ))}
    </>
  );
}

function CommentAuthor({ comment }: { comment: MarketComment }) {
  if (isIdName(comment.authorLabel)) return <IdentityName identity={comment.authorLabel} />;
  return <span className="v40-id-name">{comment.authorLabel}</span>;
}

function CommentsTab({ marketId }: { marketId: string }) {
  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState<MarketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage("");
    void fetchMarketCommentsApi(marketId)
      .then((items) => {
        if (!cancelled) setComments(items);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Comments could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  async function postComment() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setMessage("");
    try {
      const comment = await postMarketCommentApi(marketId, body);
      setComments((current) => [comment, ...current.filter((item) => item.id !== comment.id)]);
      setDraft("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Comment could not be posted.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <div className="v40-comment-box">
        <input
          id="v40CommentInput"
          value={draft}
          placeholder="Add a comment as guest..."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void postComment();
          }}
          maxLength={600}
        />
        <button className="primary" type="button" disabled={posting || !draft.trim()} onClick={() => void postComment()}>
          {posting ? "Posting" : "Post"}
        </button>
      </div>
      {message ? <div className="wallet-note route-status"><b>Comments:</b> {message}</div> : null}
      {loading ? <EmptyInline title="Loading comments." copy="Recent market comments are being fetched." /> : null}
      {!loading && !comments.length ? <EmptyInline title="No comments yet." copy="Be the first to leave a public comment on this market." /> : null}
      <div>
        {comments.map((comment) => (
          <div className="v40-comment" key={comment.id}>
            <b><CommentAuthor comment={comment} /></b>
            <span>{formatActivityTime(comment.createdAt)}</span>
            <p>{comment.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function TradersTab({ activity }: { activity: PublicMarketActivity }) {
  const traders = useMemo(() => {
    const byIdentity = new Map<string, {
      identity: string;
      side: string;
      amount: number;
      entryPrice: number | null;
      status: string;
      createdAt: string;
      count: number;
    }>();
    for (const trade of activity.trades) {
      const existing = byIdentity.get(trade.identity);
      if (!existing) {
        byIdentity.set(trade.identity, {
          identity: trade.identity,
          side: trade.side === "ride" ? "Ride" : "Fade",
          amount: trade.amount,
          entryPrice: trade.entryPrice,
          status: trade.status,
          createdAt: trade.createdAt,
          count: 1
        });
        continue;
      }
      existing.amount += trade.amount;
      existing.count += 1;
      if (Date.parse(trade.createdAt) > Date.parse(existing.createdAt)) {
        existing.side = trade.side === "ride" ? "Ride" : "Fade";
        existing.entryPrice = trade.entryPrice;
        existing.status = trade.status;
        existing.createdAt = trade.createdAt;
      }
    }
    return Array.from(byIdentity.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [activity.trades]);

  if (!traders.length) {
    return <EmptyInline title="No traders yet." copy="The first recorded Ride/Fade position will appear here." />;
  }

  return (
    <>
      {traders.map((trader) => (
        <div className="v40-row" key={trader.identity}>
          <div><b><IdentityName identity={trader.identity} /></b><span>{trader.side} - {trader.count} recorded trade{trader.count === 1 ? "" : "s"}</span></div>
          <span>{compactUsd(trader.amount)}</span>
          <span>{priceLabel(trader.entryPrice)}</span>
          <b>{toTitleLabel(trader.status)}</b>
          <ProfileButton identity={trader.identity} />
        </div>
      ))}
    </>
  );
}

function RulesTab({ market }: { market: NexMarket }) {
  const source = sourceLabel(market.sourceUrl);
  const rows = [
    ["Market question", market.question],
    ["Outcome type", "Ride / Fade"],
    ["Source type", market.origin === "polymarket" ? "Polymarket route" : "Creator market"],
    ["Source / data rule", source],
    ["Calculation", market.template ? toTitleLabel(market.template) : marketOriginDetail(market.origin)],
    ["Fallback", market.sourceUrl ? "Use visible source and locked market rules." : "Source pending"],
    ["Close time", formatDateTime(market.closeTime)],
    ["Creator bond", market.launchStakeStatus ? toTitleLabel(market.launchStakeStatus) : "Visible at launch"],
    ["Rules status", market.sourceUrl ? "Visible before trading" : "Pending source"]
  ];

  return (
    <div className="v40-rule-grid">
      {rows.map(([label, value]) => (
        <div className="v40-rule" key={label}><span>{label}</span><b>{value}</b></div>
      ))}
    </div>
  );
}

function ReceiptsTab({ activity }: { activity: PublicMarketActivity }) {
  if (!activity.receipts.length) {
    return <EmptyInline title="No receipts yet." copy="The first trade, launch or settlement receipt will appear here." />;
  }

  return (
    <div className="v40-receipt-grid">
      {activity.receipts.slice(0, 6).map((receipt) => (
        <article className="v40-mini-receipt" key={receipt.id}>
          <div>
            <h4>{receipt.proof}</h4>
            <p>{receipt.title}</p>
          </div>
          <Link className="btn" href={receipt.publicUrl || "/receipts"}>Open</Link>
        </article>
      ))}
    </div>
  );
}

export function MarketDetailTabs({ market, activity }: { market: NexMarket; activity: PublicMarketActivity }) {
  const [tab, setTab] = useState<DetailTab>("activity");

  return (
    <section className="v40-panel v40-market-tabs">
      <div className="v40-tabbar">
        {TABS.map((item) => (
          <button
            className={tab === item.key ? "active" : ""}
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="v40-tab-content">
        {tab === "activity" ? <ActivityTab market={market} activity={activity} /> : null}
        {tab === "comments" ? <CommentsTab marketId={market.id} /> : null}
        {tab === "traders" ? <TradersTab activity={activity} /> : null}
        {tab === "rules" ? <RulesTab market={market} /> : null}
        {tab === "receipts" ? <ReceiptsTab activity={activity} /> : null}
      </div>
    </section>
  );
}
