"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { legalLabels, legalPages, type LegalKey } from "@/lib/services/legalService";
import { Logo } from "@/components/nexid/shared/logo";
import { ReferralCapture } from "@/components/nexid/shared/referral-capture";

const nav = [
  ["/", "Home"],
  ["/narratives", "Live Narratives"],
  ["/boards", "EdgeBoards"],
  ["/points", "Global Points"],
  ["/mint", "Mint .id"]
] as const;

function toggleTheme() {
  const current = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  window.localStorage.setItem("nexid_theme", next);
}

export function NexidAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <ReferralCapture />
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/">
            <Logo />
            <span>NexID</span>
          </Link>
          <nav className="nav" id="nav">
            {nav.map(([href, label]) => (
              <Link key={href} className={pathname === href ? "active" : ""} href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="actions">
            <button className="theme" onClick={toggleTheme} aria-label="Toggle theme">◐</button>
            <Link className="btn mobile-menu" href="/narratives">Explore</Link>
            <Link className="primary" href="/dashboard">Dashboard</Link>
          </div>
        </div>
      </header>
      <main className="app">
        {children}
        <footer className="footer">
          <div>© 2026 NexID. Trade the timeline. Prove your edge.</div>
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
