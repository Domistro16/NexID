"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { useProduct } from "./ProductProvider";
import { guestMobileRoutes, guestRoutes, memberMobileRoutes, memberRoutes, routeFromPathname, routeHref, routeMeta, type ProductRoute } from "./route-meta";

function initials(name: string | null | undefined) {
  const parts = (name || "NexMarkets member").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "NM";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    data, connectWallet, signOut, toast, dismissToast, notify, api, refresh,
    walletConnected, connectClientWallet, signInOpen, setSignInOpen, connectWalletOpen, setConnectWalletOpen
  } = useProduct();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  const guest = !data?.authenticated;
  const route = routeFromPathname(pathname);
  const meta = guest && route === "dashboard" ? ["Start", "Choose what you need to get done"] : routeMeta[route];
  const navigation = guest ? guestRoutes : memberRoutes;
  const mobileNavigation = guest ? guestMobileRoutes : memberMobileRoutes;
  const userName = data?.user?.displayName || data?.user?.handle || "NexMarkets member";
  const unread = data?.notifications.filter((item) => !item.readAt).length ?? 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("nex-theme");
      const initial = stored === "light" ? "light" : (data?.user?.theme === "light" ? "light" : "dark");
      setTheme(initial);
      document.documentElement.dataset.theme = initial;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data?.user?.theme]);

  const closeOverlays = () => {
    setAccountOpen(false);
    setSearchOpen(false);
    setNotificationsOpen(false);
    setSignInOpen(false);
    setConnectWalletOpen(false);
  };

  const onEmailSignIn = async () => {
    if (!email.trim()) {
      notify("Email required", "Please enter your email address.");
      return;
    }
    setEmailSending(true);
    try {
      await api("/api/v1/auth/email/request", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), workspaceName: workspaceName.trim() || undefined }),
      });

      notify("Access link sent", "Check your email for a sign-in link.");
      closeOverlays();
      setEmail("");
      setWorkspaceName("");
    } catch (reason) {
      notify("Sign in failed", reason instanceof Error ? reason.message : "Try again shortly.");
    } finally {
      setEmailSending(false);
    }
  };


  const onXSignIn = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lhaelxddyiidmnowypqg.supabase.co";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    closeOverlays();
    window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=twitter&redirect_to=${encodeURIComponent(window.location.origin + '/auth/callback')}&apiKey=${encodeURIComponent(supabaseAnonKey)}`;
  };


  const go = (next: ProductRoute | "resources") => {
    closeOverlays();
    router.push(next === "resources" ? "/resources" : routeHref(next));
  };


  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !data) return [];
    const records = [
      ...data.creations.map((item) => ({ id: item.id, mark: item.type.slice(0, 2).toUpperCase(), title: item.title, detail: `Studio · ${item.status}`, href: `/studio/${item.id}` })),
      ...data.listings.map((item) => ({ id: item.id, mark: item.type.slice(0, 2).toUpperCase(), title: item.title, detail: `${item.type} · ${item.budget}`, href: `/marketplace/${item.slug}` })),
      ...data.myWork.map((item) => ({ id: item.id, mark: item.type.slice(0, 2).toUpperCase(), title: item.title, detail: `${item.side} · ${item.status}`, href: item.route === "workroom" ? `/workrooms/${item.entityId}` : "/marketplace?tab=my-work" })),
    ];
    return records.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(needle)).slice(0, 12);
  }, [data, query]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("nex-theme", next);
  };

  const onConnect = async () => {
    try { await connectWallet(); }
    catch (reason) { notify("Wallet not connected", reason instanceof Error ? reason.message : "The wallet request did not complete."); }
  };

  const onConnectClientWallet = async () => {
    try { await connectClientWallet(); }
    catch (reason) { notify("Wallet not connected", reason instanceof Error ? reason.message : "The wallet request did not complete."); }
  };

  const markNotificationRead = async (id: string, href: string | null) => {
    try {
      await api(`/api/v1/notifications/${id}/read`, { method: "POST", body: "{}" });
      await refresh();
    } catch (reason) {
      notify("Could not update notification", reason instanceof Error ? reason.message : "Try again.");
    }
    if (href) router.push(href);
  };

  return (
    <div className="app-root">
      <a className="skip-link" href="#appMain">Skip to content</a>
      <div className={`app-shell ${guest ? "guest-shell" : "member-shell"}`}>
        <aside className="sidebar" aria-label="Application navigation">
          <Link className="brand-row" href="/" aria-label="NexMarkets public site"><img src="/nexmarkets-mark.png" alt="" /><b>NexMarkets</b></Link>
          <nav className="primary-nav" aria-label="Primary">
            <div className="nav-label">{guest ? "Explore" : "Work"}</div>
            {navigation.map(([itemRoute, label, icon]) => (
              <button key={itemRoute} className={`nav-link ${route === itemRoute ? "active" : ""}`} onClick={() => go(itemRoute)} aria-current={route === itemRoute ? "page" : undefined}>
                <Icon name={icon} /><span>{label}</span>{!guest && itemRoute === "dashboard" && unread > 0 ? <i className="nav-badge">{unread}</i> : null}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            {guest ? <>
              <p className="guest-note">Browse freely. Sign in only when you need to save, pay, post or apply.</p>
              <button className="btn primary full" onClick={() => setSignInOpen(true)}>Sign in</button>
            </> : <>
              <button className="nav-link" onClick={() => setNotificationsOpen(true)}><Icon name="bell" /><span><span>Notifications</span></span>{unread > 0 ? <i className="nav-badge">{unread}</i> : null}</button>
              <button className="nav-link" onClick={() => go("docs")}><Icon name="docs" /><span>Help & Docs</span></button>
              <button className="sidebar-account" onClick={() => setAccountOpen(true)}><i className="user-avatar">{initials(userName)}</i><span><b>{userName}</b><small>Account and utilities</small></span><Icon name="more" size="sm" /></button>
            </>}
          </div>
        </aside>
        <section className="main-shell">
          <header className="topbar">
            <Link className="mobile-brand" href="/"><img src="/nexmarkets-mark.png" alt="" /><b>NexMarkets</b></Link>
            <div className="page-title"><b>{meta[0]}</b><span>{meta[1]}</span></div>
            <div className="topbar-spacer" />
            {!guest ? <button className="search-trigger" onClick={() => setSearchOpen(true)}><Icon name="search" size="sm" /><span>Search work, people or Studio output</span></button> : null}
            <button className="top-icon" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
            {guest ? <button className="btn primary compact" onClick={() => setSignInOpen(true)}>Sign in</button> : <>
              <button className="top-icon" onClick={() => setNotificationsOpen(true)} aria-label="Notifications"><Icon name="bell" />{unread > 0 ? <i className="unread" /> : null}</button>
              <button className="top-icon" onClick={() => setAccountOpen(true)} aria-label="Account and utilities"><i className="user-avatar">{initials(userName)}</i></button>
            </>}
          </header>
          <main className="view-scroll" id="appMain" tabIndex={-1}><div className="view route-enter">{children}</div></main>
        </section>
        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          {mobileNavigation.map(([itemRoute, label, icon]) => <button key={itemRoute} className={`mobile-nav-link ${itemRoute === "nex" ? "token-nav" : ""} ${route === itemRoute ? "active" : ""}`} onClick={() => go(itemRoute)}><Icon name={icon} /><span>{label}</span></button>)}
        </nav>
      </div>

      <div className={`backdrop ${accountOpen || searchOpen || notificationsOpen || signInOpen || connectWalletOpen ? "open" : ""}`} onClick={closeOverlays} />
      
      {signInOpen ? (
        <section className="modal open" role="dialog" aria-modal="true" aria-label="Sign in">
          <header className="modal-head">
            <h2>Sign in to keep your work</h2>
            <button className="close-button" onClick={closeOverlays} aria-label="Close">
              <Icon name="close" size="sm" />
            </button>
          </header>
          <div className="modal-body">
            <p className="modal-lead">Choose a method to sign in. If this is your first time, a workspace will be created.</p>
            <div className="field">
              <label htmlFor="signin-email" style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: 500 }}>Email address</label>
              <input
                id="signin-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--fg-main)" }}
              />
            </div>
            <div className="field" style={{ marginTop: "12px" }}>
              <label htmlFor="signin-workspace" style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: 500 }}>Workspace name <small style={{ color: "var(--fg-muted)", fontWeight: "normal" }}>(Optional)</small></label>
              <input
                id="signin-workspace"
                type="text"
                placeholder="e.g. My Workspace"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="input"
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--fg-main)" }}
              />
            </div>
            <div className="sign-options" style={{ marginTop: "20px" }}>
              <button className="connection-choice" onClick={onXSignIn} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--fg-main)", textAlign: "left", cursor: "pointer" }}>
                <span style={{ fontSize: "20px", fontWeight: "bold", marginRight: "12px" }}>𝕏</span>
                <span style={{ flex: 1 }}>
                  <b style={{ display: "block", fontSize: "15px" }}>Continue with X</b>
                  <small style={{ display: "block", fontSize: "12px", color: "var(--fg-muted)" }}>Sign in with your X account.</small>
                </span>
                <Icon name="arrow" size="sm" />
              </button>
            </div>
          </div>
          <footer className="modal-actions">
            <button className="btn ghost" onClick={closeOverlays}>Not now</button>
            <button className="btn primary" onClick={() => void onEmailSignIn()} disabled={emailSending}>
              {emailSending ? "Sending link..." : "Send access link"}
            </button>
          </footer>
        </section>
      ) : null}


      {connectWalletOpen ? (
        <section className="modal open" role="dialog" aria-modal="true" aria-label="Connect wallet">
          <header className="modal-head">
            <h2>Connect and verify a wallet</h2>
            <button className="close-button" onClick={closeOverlays} aria-label="Close">
              <Icon name="close" size="sm" />
            </button>
          </header>
          <div className="modal-body">
            <p className="modal-lead">Balances are read from Robinhood Chain after a signed authentication challenge. NexMarkets never asks for a recovery phrase.</p>
            <div className="wallet-preview">
              <div><span>Network</span><b>Robinhood Chain</b></div>
              <div>
                <span>USDC</span>
                <b>{walletConnected ? `${(Number(data?.wallet.usdcAtomic || 0) / 1e6).toFixed(2)} detected` : "Read after verification"}</b>
              </div>
              <div>
                <span>$NEX</span>
                <b>{walletConnected ? `${(Number(data?.wallet.nexAtomic || 0) / 1e18).toLocaleString()} detected` : "Read after verification"}</b>
              </div>
              <div><span>Permission</span><b>Sign in · read balances · request explicit transactions</b></div>
            </div>
          </div>
          <footer className="modal-actions">
            <button className="btn ghost" onClick={closeOverlays}>Cancel</button>
            <button className="btn primary" onClick={() => void onConnectClientWallet()}>Verify wallet</button>
          </footer>
        </section>
      ) : null}

      <aside className={`sheet side-sheet ${accountOpen ? "open" : ""}`} aria-hidden={!accountOpen}>
        <header className="sheet-head"><h2>Account and utilities</h2><button className="close-button" onClick={closeOverlays} aria-label="Close"><Icon name="close" size="sm" /></button></header>
        <div className="sheet-body">
          <div className="account-summary">
            <i className="user-avatar">{initials(userName)}</i>
            <span>
              <b>{userName}</b>
              <small>{walletConnected ? "Wallet connected" : "Wallet not connected"}</small>
            </span>
          </div>
          {!walletConnected ? (
            <button className="btn primary full" style={{ margin: "12px 0" }} onClick={() => { setAccountOpen(false); setConnectWalletOpen(true); }}>Connect wallet</button>
          ) : null}
          <div className="utility-links">
            <button className="utility-link" onClick={() => go("resources")}><Icon name="vault" /><span>Your resources</span></button>
            <button className="utility-link" onClick={() => go("wallet")}><Icon name="wallet" /><span>Wallet & Payments</span></button>
            <button className="utility-link" onClick={() => { setAccountOpen(false); setNotificationsOpen(true); }}><Icon name="bell" /><span>Notifications</span></button>
            <button className="utility-link" onClick={() => go("docs")}><Icon name="docs" /><span>Docs</span></button>
            <button className="utility-link" onClick={() => go("settings")}><Icon name="gear" /><span>Settings</span></button>
            <button className="utility-link" onClick={() => void signOut()}><Icon name="user" /><span>Sign out</span></button>
          </div>
        </div>
      </aside>

      <aside className={`sheet side-sheet ${notificationsOpen ? "open" : ""}`} aria-hidden={!notificationsOpen}>
        <header className="sheet-head"><h2>Notifications</h2><button className="close-button" onClick={closeOverlays} aria-label="Close"><Icon name="close" size="sm" /></button></header>
        <div className="sheet-body">
          <div className="notification-list">
            {data?.notifications.length ? data.notifications.map((item) => <button key={item.id} className={`notification-item ${item.readAt ? "" : "unread-item"}`} onClick={() => void markNotificationRead(item.id, item.href)}><i><Icon name="bell" size="sm" /></i><span><b>{item.title}</b><span>{item.body}</span><small>{new Date(item.createdAt).toLocaleString()}</small></span></button>) : <div className="market-empty"><h2>No notifications yet.</h2><p>Production, application and Workroom updates will appear here.</p></div>}
          </div>
        </div>
      </aside>

      <section className={`command ${searchOpen ? "open" : ""}`} role="dialog" aria-label="Global search">
        <div className="command-input"><Icon name="search" /><input autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, work, people or Studio output" autoFocus={searchOpen} /><button className="close-button" onClick={closeOverlays} aria-label="Close"><Icon name="close" size="sm" /></button></div>
        <div className="command-results">{query && !searchResults.length ? <div className="market-empty"><h2>No result found.</h2><p>Try a title, work type or status.</p></div> : <div className="result-group">{searchResults.length ? <h3>Results</h3> : null}{searchResults.map((item) => <button key={`${item.id}:${item.href}`} className="result-item" onClick={() => { closeOverlays(); router.push(item.href); }}><i>{item.mark}</i><span><b>{item.title}</b><span>{item.detail}</span></span><small>Open</small></button>)}</div>}</div>
      </section>

      <div className={`toast ${toast ? "open" : ""}`} role="status"><i><Icon name="check" size="sm" /></i><span><b>{toast?.title || "Saved"}</b><span>{toast?.text || "Your change is ready."}</span></span><button onClick={dismissToast} aria-label="Dismiss notification"><Icon name="close" size="sm" /></button></div>
    </div>
  );
}
