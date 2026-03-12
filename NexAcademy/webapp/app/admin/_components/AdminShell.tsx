"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { useENSName } from "@/hooks/getPrimaryName";

type AdminSection = "overview" | "projects" | "matrix" | "domains" | "builder" | "analytics";

const HEADER_BY_SECTION: Record<AdminSection, string> = {
  overview: "Global Overview & Treasury",
  projects: "Project Matrix",
  matrix: "Global Student Matrix",
  domains: "Reserved Domain Claims",
  builder: "Campaign Architect",
  analytics: "AI Overwatch",
};

interface AdminShellProps {
  active: AdminSection;
  children: ReactNode;
  noPadding?: boolean;
}

function navClasses(isActive: boolean, withTopMargin = false) {
  return [
    "w-full flex items-center gap-4 px-5 py-2.5 border-l-2 transition-all text-xs font-medium",
    withTopMargin ? "mt-4" : "",
    isActive
      ? "bg-[#111] border-nexid-gold text-white"
      : "border-transparent text-nexid-muted hover:text-white hover:bg-[#111]/50",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function AdminShell({ active, children, noPadding = false }: AdminShellProps) {
  const { address } = useAccount();
  const { name: domainName } = useENSName({ owner: address as `0x${string}` });
  const [adminLabel, setAdminLabel] = useState<string>("...");
  const [adminInitial, setAdminInitial] = useState<string>("N");

  useEffect(() => {
    if (domainName && typeof domainName === "string" && domainName.length > 0) {
      setAdminLabel(domainName);
      setAdminInitial(domainName.charAt(0).toUpperCase());
    } else if (address) {
      setAdminLabel(`${address.slice(0, 6)}...${address.slice(-4)}`);
      setAdminInitial(address.slice(2, 3).toUpperCase());
    }
  }, [domainName, address]);

  const displayParts = adminLabel.includes(".id")
    ? { name: adminLabel.replace(".id", ""), suffix: ".id" }
    : { name: adminLabel, suffix: "" };

  return (
    <div className="h-screen w-full flex overflow-hidden text-sm bg-black">
      <aside className="w-16 hover:w-64 border-r border-[#1a1a1a] bg-[#050505] flex flex-col shrink-0 z-50 transition-all duration-300 overflow-hidden group absolute md:relative h-full">
        <Link href="/" className="h-14 flex items-center px-4 border-b border-[#1a1a1a] shrink-0 min-w-[256px]">
          <div className="w-8 h-8 rounded bg-nexid-gold text-black flex items-center justify-center font-black text-xl shrink-0 shadow-gold-glow">
            N
          </div>
          <div className="font-display font-black text-lg tracking-tighter ml-3 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            NexID{" "}
            <span className="text-[9px] font-mono border border-nexid-gold/50 text-nexid-gold px-1.5 py-0.5 rounded ml-1 bg-nexid-gold/10">
              ROOT
            </span>
          </div>
        </Link>

        <div className="p-4 border-b border-[#1a1a1a] min-w-[256px]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-nexid-gold flex items-center justify-center bg-[#111] text-nexid-gold font-bold text-xs shrink-0">
              {adminInitial}
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="text-xs font-bold text-white leading-tight">
                {displayParts.name}
                {displayParts.suffix ? <span className="text-nexid-gold">{displayParts.suffix}</span> : null}
              </div>
              <div className="text-[9px] font-mono text-nexid-muted">Admin</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 space-y-1 overflow-x-hidden min-w-[256px]">
          <Link href="/admin/overview" className={navClasses(active === "overview")}>
            <span className="w-4 h-4 shrink-0 text-center">[]</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">Protocol Overview</span>
          </Link>
          <Link href="/admin/projects" className={navClasses(active === "projects")}>
            <span className="w-4 h-4 shrink-0 text-center">##</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">Project Matrix</span>
          </Link>
          <Link href="/admin/matrix" className={navClasses(active === "matrix")}>
            <span className="w-4 h-4 shrink-0 text-center">LB</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">Student Matrix (Global LB)</span>
          </Link>
          <Link href="/admin/domains" className={navClasses(active === "domains")}>
            <span className="w-4 h-4 shrink-0 text-center">ID</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">Reserved Domains</span>
          </Link>
          <Link href="/admin/builder" className={navClasses(active === "builder", true)}>
            <span className="w-4 h-4 shrink-0 text-center">&lt;/&gt;</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">Campaign Architect</span>
          </Link>
          <Link href="/admin/analytics" className={navClasses(active === "analytics")}>
            <span className="w-4 h-4 shrink-0 text-center">AI</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">AI Overwatch</span>
          </Link>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-black ml-16 md:ml-0 relative">
        <header className="h-14 border-b border-[#1a1a1a] flex items-center justify-between px-6 bg-[#050505] shrink-0 z-30 shadow-sm">
          <h2 className="text-xs font-mono font-bold text-white uppercase tracking-widest">
            {HEADER_BY_SECTION[active]}
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-[#0a0a0a] border border-[#222] rounded p-0.5">
              <button className="px-3 py-1 bg-[#222] text-white text-[9px] font-mono rounded-sm">MAINNET</button>
              <button className="px-3 py-1 text-nexid-muted hover:text-white text-[9px] font-mono rounded-sm transition-colors">
                TESTNET
              </button>
            </div>
            <div className="h-4 w-px bg-[#222]" />
            <div className="flex items-center gap-2 text-[10px] font-mono text-nexid-muted">
              {adminLabel}
            </div>
          </div>
        </header>

        <div className={`flex-1 overflow-y-auto custom-scroll ${noPadding ? "" : "p-6"}`}>{children}</div>
      </main>
    </div>
  );
}
