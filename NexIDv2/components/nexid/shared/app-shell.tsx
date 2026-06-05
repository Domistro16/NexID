"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/nexid/shared/logo";
import { ReferralCapture } from "@/components/nexid/shared/referral-capture";
import { legalLabels, legalPages, type LegalKey } from "@/lib/services/legalService";
import type { AuthUser } from "@/lib/types/nexid";

const nav = [
  ["home", "/", "Home"],
  ["narratives", "/markets", "Markets"],
  ["launch", "/launch", "Launch"],
  ["boards", "/edgeboard", "EdgeBoard"],
  ["mint", "/mint", "Mint .id"]
] as const;

type DashboardMenuTab = "overview" | "markets" | "alerts" | "earnings" | "activity" | "id";

const dashboardMenu = [
  { key: "dashboard", label: "Dashboard", description: "Trades, markets, earnings and receipts", tab: "overview" },
  { key: "created", label: "Created markets", description: "Volume, fees, bond and settlement", tab: "markets" },
  { key: "activity", label: "Activity", description: "Trades, orders and reward history", tab: "activity" },
  { key: "referrals", label: "Referrals", description: ".id minters and instant rewards", tab: "earnings" },
  { key: "mint", label: "Mint .id", description: "Optional proof layer", href: "/mint" }
] as const;

type TapeTrade = {
  id: string;
  marketId: string;
  marketTitle: string;
  identity: string;
  side: "ride" | "fade";
  amount: number;
  yesPrice: number | null;
  status?: string;
  createdAt?: string;
};

type TapeMarket = {
  id: string;
  title: string;
  origin?: string;
  status?: string;
  creatorIdentity?: string | null;
  routeDecision?: unknown;
  updatedAt?: string;
  createdAt?: string;
};

type TapeItem = {
  identity: string;
  verb: string;
  title: string;
  price: string;
  marketId: string;
};

const edgeNavDefault = {
  label: "1W · Overall",
  detail: "Controls"
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function tradeTapePrice(trade: TapeTrade) {
  const amount = Number.isFinite(trade.amount) && trade.amount > 0 ? `$${trade.amount.toFixed(trade.amount >= 100 ? 0 : 2)}` : "Trade";
  const yes = trade.yesPrice === null || !Number.isFinite(trade.yesPrice)
    ? null
    : `${Math.round(trade.yesPrice * 100)}¢ YES`;
  return yes ? `${amount} · ${yes}` : amount;
}

function tradeToTapeItem(trade: TapeTrade): TapeItem {
  return {
    identity: trade.identity || "Trader",
    verb: trade.side === "ride" ? "rode" : "faded",
    title: trade.marketTitle,
    price: tradeTapePrice(trade),
    marketId: trade.marketId
  };
}

function tapePrice(market: TapeMarket) {
  const route = asRecord(market.routeDecision);
  const candidates = Array.isArray(route.polymarketCandidates) ? route.polymarketCandidates : [];
  const first = asRecord(candidates[0]);
  const raw = asRecord(first.raw);
  const prices = Array.isArray(raw.outcomePrices) ? raw.outcomePrices : [];
  const price = Number(prices[0]);

  if (Number.isFinite(price)) return `${Math.round(price * 100)}¢ YES`;
  if (market.status === "closed") return "Closed";
  if (market.status === "result_proposed") return "Result pending";
  if (market.status === "disputed") return "Under review";
  if (market.status === "settled") return "Settled";
  if (market.origin === "native") return "Native";
  return market.status === "trading_live" ? "Live" : "Open";
}

function marketToTapeItem(market: TapeMarket): TapeItem {
  return {
    identity: market.creatorIdentity || "NexMarkets",
    verb: market.origin === "native" ? "launched" : "routed",
    title: market.title,
    price: tapePrice(market),
    marketId: market.id
  };
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  document.documentElement.classList.toggle("dark", next === "dark");
  window.localStorage.setItem("nexid_theme", next);
}

export function NexidAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dashboardMenuRef = useRef<HTMLDivElement | null>(null);
  const [showEdgeNavControl, setShowEdgeNavControl] = useState(false);
  const [edgeNavState, setEdgeNavState] = useState(edgeNavDefault);
  const [activityItems, setActivityItems] = useState<TapeItem[]>([]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [dashboardMenuOpen, setDashboardMenuOpen] = useState(false);
  const isEdgeBoardRoute = pathname === "/edgeboard" || pathname === "/boards";
  const activeView = pathname === "/pulse" || pathname.startsWith("/market")
    ? "narratives"
    : pathname === "/boards" || pathname === "/edgeboard"
      ? "boards"
      : pathname === "/my-edge" || pathname.startsWith("/id/")
        ? "dashboard"
        : nav.find(([, href]) => href === pathname)?.[0] ?? "";

  function showView(href: string) {
    router.push(href);
  }

  function openDetail(marketId: string) {
    router.push(`/market/${marketId}`);
  }

  function toggleEdgeNavPop() {
    window.dispatchEvent(new CustomEvent("edge65:toggle-nav-pop"));
  }

  function openDashboard(tab: DashboardMenuTab = "overview") {
    window.sessionStorage.setItem("nexmarkets_dashboard_tab", tab);
    window.dispatchEvent(new CustomEvent("nexmarkets:dashboard-tab", { detail: { tab } }));
    setDashboardMenuOpen(false);
    router.push("/dashboard");
  }

  function openDashboardMenuItem(item: (typeof dashboardMenu)[number]) {
    setDashboardMenuOpen(false);
    if ("href" in item) {
      router.push(item.href);
      return;
    }
    openDashboard(item.tab);
  }

  useEffect(() => {
    const saved = window.localStorage.getItem("nexid_theme");
    const next = saved === "dark" || saved === "light"
      ? saved
      : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "dark");
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/markets/recent-trades?limit=12", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ trades?: TapeTrade[] }> : { trades: [] })
      .then((data) => {
        if (cancelled) return;
        const trades = Array.isArray(data.trades) ? data.trades : [];
        setActivityItems(
          trades
            .filter((trade) => trade.marketId && trade.marketTitle)
            .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
            .slice(0, 8)
            .map(tradeToTapeItem)
        );
      })
      .catch(() => {
        if (!cancelled) setActivityItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshAuth = () => {
      void fetch("/api/auth/me", { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<{ user: AuthUser | null }> : { user: null })
        .then((data) => {
          if (!cancelled) setAuthUser(data.user ?? null);
        })
        .catch(() => {
          if (!cancelled) setAuthUser(null);
        });
    };

    const onAuthChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ user?: AuthUser | null }>).detail;
      if (detail && "user" in detail) {
        setAuthUser(detail.user ?? null);
        return;
      }
      refreshAuth();
    };

    refreshAuth();
    window.addEventListener("focus", refreshAuth);
    window.addEventListener("nexid:auth-changed", onAuthChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshAuth);
      window.removeEventListener("nexid:auth-changed", onAuthChanged);
    };
  }, [pathname]);

  useEffect(() => {
    setDashboardMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!dashboardMenuOpen) return;

    const onClick = (event: MouseEvent) => {
      if (!dashboardMenuRef.current?.contains(event.target as Node)) {
        setDashboardMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDashboardMenuOpen(false);
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [dashboardMenuOpen]);

  useEffect(() => {
    const sync = () => setShowEdgeNavControl(isEdgeBoardRoute && window.innerWidth > 720 && window.scrollY > 300);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [isEdgeBoardRoute]);

  useEffect(() => {
    const onNavState = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string; detail?: string; active?: boolean }>).detail;
      if (detail?.active === false) {
        setEdgeNavState(edgeNavDefault);
        setShowEdgeNavControl(false);
        return;
      }
      setEdgeNavState({
        label: detail?.label || edgeNavDefault.label,
        detail: detail?.detail || edgeNavDefault.detail
      });
    };
    window.addEventListener("edge65:nav-state", onNavState);
    return () => window.removeEventListener("edge65:nav-state", onNavState);
  }, []);

  return (
    <>
      <ReferralCapture />
      <div className="nm-activity" aria-label="Live market activity">
        <div className="nm-activity-track" id="activityTape">
          {[...activityItems, ...activityItems].map(({ identity, verb, title, price, marketId }, index) => (
            <span className="nm-tape-item" key={`${identity}-${title}-${index}`}>
              <span className="nm-tape-dot" />
              <b>{identity}</b>
              {verb}
              <b>{title}</b>
              <span style={{ color: "var(--gold)", fontWeight: 950 }}>{price}</span>
              <button className="nm-view-btn" type="button" onClick={() => openDetail(marketId)}>View</button>
            </span>
          ))}
        </div>
      </div>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand nex-logo-word" href="/">
            <Logo />
            <span>NexMarkets</span>
          </Link>
          <nav className="nav" id="nav">
            {nav.map(([view, href, label]) => (
              <button
                key={view}
                data-view={view}
                className={activeView === view ? "active" : ""}
                type="button"
                onClick={() => showView(href)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="actions">
            {isEdgeBoardRoute ? (
              <button
                id="edge65NavControl"
                className={`edge65-nav-control ${showEdgeNavControl ? "show" : ""}`}
                type="button"
                onClick={toggleEdgeNavPop}
              >
                <span>{edgeNavState.label}</span>
                <small>{edgeNavState.detail}</small>
              </button>
            ) : null}
            <button className="theme" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
              ◐
            </button>
            <div
              className={`nm-auth-wrap ${dashboardMenuOpen ? "open" : ""}`}
              ref={dashboardMenuRef}
              data-auth-state={authUser ? "authenticated" : "guest"}
            >
              <button
                className="btn nm-profile-pill"
                id="topCta"
                type="button"
                aria-haspopup="menu"
                aria-expanded={dashboardMenuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setDashboardMenuOpen((open) => !open);
                }}
              >
                Dashboard {"\u25BE"}
              </button>
              <div className="nm-profile-menu" role="menu">
                {dashboardMenu.map((item) => (
                  <button key={item.key} type="button" role="menuitem" onClick={() => openDashboardMenuItem(item)}>
                    {item.label}
                    <span className="muted">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="app">
        {children}
        <footer className="footer">
          <div>(c) 2026 NexMarkets. Have a thesis? Make it a market.</div>
          <div className="footer-links">
            {(Object.keys(legalPages) as LegalKey[]).map((key) => (
              <Link key={key} href={`/legal/${key}`}>{legalLabels[key]}</Link>
            ))}
          </div>
        </footer>
      </main>
    </>
  );
}
