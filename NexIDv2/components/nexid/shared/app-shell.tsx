"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Logo } from "@/components/nexid/shared/logo";
import { ReferralCapture } from "@/components/nexid/shared/referral-capture";
import { legalLabels, legalPages, type LegalKey } from "@/lib/services/legalService";

const nav = [
  ["/pulse", "Pulse"],
  ["/launch", "Launch"],
  ["/edgeboard", "EdgeBoard"],
  ["/passport", "Passport"],
  ["/mint", "Mint .id"]
] as const;

function toggleTheme() {
  const current = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  document.documentElement.classList.toggle("dark", next === "dark");
  window.localStorage.setItem("nexid_theme", next);
}

export function NexidAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const saved = window.localStorage.getItem("nexid_theme");
    const next = saved === "dark" || saved === "light"
      ? saved
      : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "dark");
  }, []);

  return (
    <>
      <ReferralCapture />
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/pulse">
            <Logo />
            <span>NexMarkets</span>
          </Link>
          <nav className="nav" id="nav">
            {nav.map(([href, label]) => (
              <Link key={href} className={pathname === href ? "active" : ""} href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="actions">
            <button className="theme" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
              <span aria-hidden="true" />
            </button>
            <Link className="btn mobile-menu" href="/pulse">Explore</Link>
            <Link className="primary" href="/my-edge">My Edge</Link>
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
