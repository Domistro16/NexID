"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CustomConnect } from "@/components/connectButton";

interface AcademyLayoutProps {
  children: ReactNode;
}

function navClass(active: boolean) {
  return active ? "text-white" : "text-nexid-muted hover:text-white transition-colors";
}

export default function AcademyLayout({ children }: AcademyLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("q") || "");

  useEffect(() => {
    setSearchValue(searchParams.get("q") || "");
  }, [searchParams]);

  // Dashboard has its own full layout — skip the academy wrapper
  if (pathname.startsWith("/academy/dashboard")) {
    return <>{children}</>;
  }

  const inBrowse = pathname === "/academy" || pathname.startsWith("/academy/campaign/");
  const inLeaderboard = pathname.startsWith("/academy/leaderboard");
  const inFaq = pathname.startsWith("/academy/faq");

  function runSearch() {
    const q = searchValue.trim();
    if (q) {
      router.push(`/academy?q=${encodeURIComponent(q)}`);
      return;
    }
    router.push("/academy");
  }

  return (
    <div className="nexid-academy flex h-screen flex-col overflow-hidden">
      <div className="bg-stardust" />
      <div className="bg-glow" />
      <div className="shooting-star star-1" />
      <div className="shooting-star star-2" />
      <div className="shooting-star star-3" />

      <header className="sticky top-0 z-50 h-20 shrink-0 border-b border-nexid-border bg-[#030303]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-full w-full max-w-[1600px] items-center gap-10 px-6 lg:px-10">
          <Link href="/" className="font-display text-2xl font-black tracking-tighter">
            N<span className="hidden sm:inline">ex</span>ID
            <span className="text-nexid-gold">.</span>
          </Link>

          <nav className="hidden gap-6 text-sm font-medium md:flex">
            <Link href="/academy" className={navClass(inBrowse)}>
              Academy
            </Link>
            <Link href="/academy/leaderboard" className={navClass(inLeaderboard)}>
              Global Leaderboard
            </Link>
            <Link href="/academy/faq" className={navClass(inFaq)}>
              Protocol FAQ
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-5">
            {/* Search */}
            <div className="relative hidden lg:block group">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  runSearch();
                }}
              >
                <button
                  type="submit"
                  aria-label="Search campaigns"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-nexid-muted transition-colors group-focus-within:text-nexid-gold"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search campaigns..."
                  className="bg-[#0a0a0a] border border-[#222] rounded-full pl-9 pr-4 py-2 text-xs text-white transition-all w-60 focus:w-80 focus:bg-[#111] placeholder:text-[#555]"
                />
              </form>
            </div>

            <CustomConnect />
            <Link href="/academy/dashboard" className="rounded-lg bg-white px-5 py-2 text-sm font-bold text-black hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all shrink-0">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="custom-scroll relative flex-1 overflow-y-auto pb-24">{children}</main>
    </div>
  );
}
