"use client";

import React from "react";
import Link from "next/link";
import { useTheme } from "@/app/providers";
import { User } from "lucide-react";
import { NavBar } from "./NavBar";

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className={`w-full min-h-screen ${isDark
        ? "bg-[#0a0a0f] text-white"
        : "bg-[radial-gradient(circle_at_20%_0%,#fff5d9,transparent_60%),radial-gradient(circle_at_80%_120%,#fff3cd,transparent_60%),linear-gradient(to_bottom,#ffffff,#fff9ea)] text-[#050509]"
        }`}
    >
      <NavBar />

      {/* Floating Profile Button - Bottom Left */}
      <Link
        href="/academy"
        className={`fixed bottom-6 left-6 z-50 flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl ${isDark
          ? "bg-[#ffb000] text-black hover:bg-[#ffa000]"
          : "bg-[#111] text-white hover:bg-[#333]"
          }`}
        aria-label="Go to Academy"
      >
        <User className="w-5 h-5" />
      </Link>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-0 pb-24 pt-6">
        {children}
      </main>

      <footer
        className={`w-full pt-20 pb-10 text-center border-t mt-10 ${isDark
          ? "bg-[#0a0a0f] border-white/10"
          : "bg-[#fff9ea] border-black/5"
          }`}
      >
        <h2
          className={`text-3xl md:text-4xl font-bold mb-4 tracking-[-0.03em] ${isDark ? "text-white" : "text-[#111]"
            }`}
        >
          Level Up Your Skills & Knowledge
          <br />
          with Nex Academy Today        </h2>

        <Link href="/academy">
          <button
            className={`px-10 py-4 rounded-full font-semibold text-base md:text-lg transition shadow-[0_20px_50px_rgba(15,23,42,0.35)] ${isDark
              ? "bg-[#ffb000] text-black hover:bg-[#ffa000]"
              : "bg-[#111] text-white hover:bg-[#222]"
              }`}
          >
            Start Learning Now
          </button>
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-10">
          <a href="https://safuverse.gitbook.io/safuverse-docs/" target="_blank" rel="noopener noreferrer">
            <button
              className={`px-8 py-3 rounded-full border font-medium transition text-sm ${isDark
                ? "border-white/20 text-white bg-white/5 hover:bg-white/10"
                : "border-black/80 text-[#111] bg-white hover:bg-[#f5f5f5]"
                }`}
            >
              Read Docs
            </button>
          </a>

          <a href="https://names.idverse.com" target="_blank" rel="noopener noreferrer">
            <button
              className={`px-8 py-3 rounded-full shadow-sm border flex items-center gap-2 font-medium transition text-sm ${isDark
                ? "bg-white/5 border-white/10 text-white hover:bg-white/10"
                : "bg-white border-black/10 text-[#111] hover:bg-[#f5f5f5]"
                }`}
            >
              Mint .id
            </button>
          </a>


          <a href="https://safuverse.gitbook.io/safuverse-docs/security/audits" target="_blank" rel="noopener noreferrer">
            <button
              className={`px-8 py-3 rounded-full shadow-sm border flex items-center gap-2 font-medium transition text-sm ${isDark
                ? "bg-white/5 border-white/10 text-white hover:bg-white/10"
                : "bg-white border-black/10 text-[#111] hover:bg-[#f5f5f5]"
                }`}
            >
              Audit Report
            </button>
          </a>
        </div>

        <p
          className={`mt-12 text-[11px] tracking-[0.18em] uppercase ${isDark ? "text-gray-500" : "text-[#777]"
            }`}
        >
          Nex Academy (c) 2025 - Designed by Level3 Labs
        </p>
      </footer>
    </div>
  );
};

export default Layout;
