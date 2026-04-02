"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CustomConnect } from "@/components/connectButton";

interface AcademyLayoutProps {
  children: ReactNode;
}

type ActiveCampaign = {
  campaignId: number;
  title: string;
  status: string;
  completedAt: string | null;
};

export default function AcademyLayout({ children }: AcademyLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("q") || "");
  const [activeCampaign, setActiveCampaign] = useState<ActiveCampaign | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSearchValue(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;

    async function loadActiveCampaign() {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      if (!token) {
        if (active) {
          setActiveCampaign(null);
        }
        return;
      }

      try {
        const res = await fetch("/api/user/campaigns", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Failed to load user campaigns");
        }

        const body = await res.json();
        const campaigns: ActiveCampaign[] = Array.isArray(body.campaigns) ? body.campaigns : [];
        const current =
          campaigns.find((campaign) => campaign.status === "LIVE" && !campaign.completedAt) ??
          campaigns.find((campaign) => !campaign.completedAt) ??
          null;

        if (active) {
          setActiveCampaign(current);
        }
      } catch {
        if (active) {
          setActiveCampaign(null);
        }
      }
    }

    loadActiveCampaign();

    const syncActiveCampaign = () => {
      loadActiveCampaign();
    };

    window.addEventListener("storage", syncActiveCampaign);
    window.addEventListener("nexid-auth-changed", syncActiveCampaign as EventListener);
    window.addEventListener("academy-campaign-state-changed", syncActiveCampaign as EventListener);

    return () => {
      active = false;
      window.removeEventListener("storage", syncActiveCampaign);
      window.removeEventListener("nexid-auth-changed", syncActiveCampaign as EventListener);
      window.removeEventListener("academy-campaign-state-changed", syncActiveCampaign as EventListener);
    };
  }, [pathname]);

  const inBrowse = pathname === "/academy";
  const inCampaign = pathname.startsWith("/academy/campaign/");
  const inLeaderboard = pathname.startsWith("/academy/leaderboard");
  const inDashboard = pathname.startsWith("/academy/dashboard");
  const inIdentity = pathname.startsWith("/academy/identity");
  const inEarnings = pathname.startsWith("/academy/earnings");
  const inFaq = pathname.startsWith("/academy/faq");
  const inInterview = pathname.startsWith("/academy/interview");

  const campaignHref = inCampaign
    ? pathname
    : activeCampaign
    ? `/academy/campaign/${activeCampaign.campaignId}`
    : null;

  const title = inCampaign
    ? "Course"
    : inLeaderboard
    ? "Leaderboard"
    : inIdentity
    ? "My .id"
    : inEarnings
    ? "Earnings"
    : inInterview
    ? "Interview"
    : inDashboard
    ? "Dashboard"
    : inFaq
    ? "Protocol FAQ"
    : "Academy";

  function runSearch() {
    const q = searchValue.trim();
    if (q) {
      router.push(`/academy?q=${encodeURIComponent(q)}`);
      return;
    }
    router.push("/academy");
  }

  return (
    <div className="academy-shell-ref">
      <div className={`sb-overlay ${sidebarOpen ? "on" : ""}`} onClick={() => setSidebarOpen(false)} />

        <div className="app">
          <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <Link href="/academy" className="sb-logo">
            <img src="/nexid_logo.png" className="sb-logo-img" alt="NexID" />
          </Link>

          <nav className="sb-nav">
            <span className="sb-section">Learn</span>
            <Link href="/academy" className={`sb-btn ${inBrowse ? "on" : ""}`}>
              <svg className="sb-ic" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
              <div className="sb-btn-lbl">Academy<span className="sb-btn-sub">Browse courses</span></div>
            </Link>

            {campaignHref ? (
              <Link href={campaignHref} className={`sb-btn ${inCampaign ? "on" : ""}`}>
                <svg className="sb-ic" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                <div className="sb-btn-lbl">
                  Active Campaign
                  <span className="sb-btn-sub">{activeCampaign?.title || "In progress"}</span>
                </div>
                {!inCampaign ? <span className="sb-notif">1</span> : null}
              </Link>
            ) : null}

            <span className="sb-section">Compete</span>
            <Link href="/academy/leaderboard" className={`sb-btn ${inLeaderboard ? "on" : ""}`}>
              <svg className="sb-ic" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              <div className="sb-btn-lbl">Leaderboard<span className="sb-btn-sub">Global rankings</span></div>
            </Link>

            <span className="sb-section">Account</span>
            <Link href="/academy/dashboard" className={`sb-btn ${inDashboard ? "on" : ""}`}>
              <svg className="sb-ic" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              <div className="sb-btn-lbl">Dashboard<span className="sb-btn-sub">Progress overview</span></div>
            </Link>
            <Link href="/academy/identity" className={`sb-btn ${inIdentity ? "on" : ""}`}>
              <svg className="sb-ic" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <div className="sb-btn-lbl">My .id<span className="sb-btn-sub">Passport identity</span></div>
            </Link>
            <Link href="/academy/earnings" className={`sb-btn ${inEarnings ? "on" : ""}`}>
              <svg className="sb-ic" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 18z" />
              </svg>
              <div className="sb-btn-lbl">Earnings<span className="sb-btn-sub">Rewards history</span></div>
            </Link>
          </nav>

          <div className="sb-foot">
            <Link href="/academy/identity" className="sb-user">
              <div className="sb-av">N</div>
              <div>
                <div className="sb-uname">NexID</div>
                <div className="sb-uid">{activeCampaign ? "Campaign active" : "Academy shell"}</div>
              </div>
            </Link>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <button type="button" className="tb-ham" onClick={() => setSidebarOpen((prev) => !prev)}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="tb-title">{title}</div>
            <div className="tb-search-wrap">
              <svg className="tb-search-ico" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  runSearch();
                }}
              >
                <input
                  className="tb-search"
                  type="text"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search courses..."
                />
              </form>
            </div>
            <div className="tb-right">
              <CustomConnect />
              <Link href="/partner-portal" className="tb-btn-proto">
                For Protocols
              </Link>
            </div>
          </div>

          <main className="vc">{children}</main>

          <nav className="bottom-nav">
            <div className="bottom-nav-inner">
              <Link href="/academy" className={`bn-item ${inBrowse ? "on" : ""}`}>
                <svg className="bn-ico" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                <span className="bn-lbl">Academy</span>
              </Link>
              <Link href="/academy/dashboard" className={`bn-item ${inDashboard ? "on" : ""}`}>
                <svg className="bn-ico" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
                <span className="bn-lbl">Dashboard</span>
              </Link>
              <Link href="/academy/identity" className={`bn-item ${inIdentity ? "on" : ""}`}>
                <svg className="bn-ico" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span className="bn-lbl">Identity</span>
              </Link>
              <Link href="/academy/leaderboard" className={`bn-item ${inLeaderboard ? "on" : ""}`}>
                <svg className="bn-ico" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <span className="bn-lbl">Leaderboard</span>
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
