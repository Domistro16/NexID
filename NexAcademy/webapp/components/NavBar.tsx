"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CustomConnect } from "@/components/connectButton";
import { useTheme } from "@/app/providers";
import { Sun, Moon } from "lucide-react";

function NavLink({
  href,
  children,
  isDark,
}: {
  href: string;
  children: React.ReactNode;
  isDark: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`hover:opacity-100 transition ${isActive
          ? isDark
            ? "text-white font-semibold"
            : "text-[#111] font-semibold"
          : isDark
            ? "text-gray-400 opacity-80"
            : "text-[#555] opacity-80"
        }`}
    >
      {children}
    </Link>
  );
}

export const NavBar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav
      className={`w-full flex items-center justify-between px-6 lg:px-10 py-4 lg:py-5 backdrop-blur border-b sticky top-0 z-50 ${isDark ? "bg-[#0a0a0f]/90 border-white/10" : "bg-white/60 border-black/5"
        }`}
    >
      <Link
        href="/"
        className={`flex items-center gap-2 text-[18px] lg:text-[20px] font-bold tracking-[-0.03em] ${isDark ? "text-white" : "text-[#111]"
          }`}
      >
        <img src="/nexid_logo.png" className="h-10 hidden md:block" alt="NexID" />
        <img src="/nexid_logo.png" className="h-11 block md:hidden" alt="NexID" />
      </Link>

      <div className="hidden md:flex items-center gap-4 lg:gap-6 text-sm">
        <NavLink href="/" isDark={isDark}>
          Home
        </NavLink>
        <NavLink href="/academy" isDark={isDark}>
          Academy
        </NavLink>
        <NavLink href="/academy" isDark={isDark}>
          Campaigns
        </NavLink>
        <NavLink href="/certificates" isDark={isDark}>
          Certificates
        </NavLink>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 lg:gap-5">
        <a
          href="https://x.com/SafuVerse"
          target="_blank"
          rel="noopener noreferrer"
          className={`hidden md:block opacity-80 hover:opacity-100 transition transform hover:scale-105 ${isDark ? "text-white" : "text-[#111]"
            }`}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
        </a>
        <a
          href="https://discord.gg/safuverse"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:block text-[#5865F2] opacity-80 hover:opacity-100 transition transform hover:scale-105"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9460 2.4189-2.1568 2.4189z" /></svg>
        </a>

        <button
          onClick={toggleTheme}
          className={`flex w-[34px] h-[34px] sm:w-[38px] sm:h-[38px] lg:w-[42px] lg:h-[42px] rounded-full items-center justify-center transition cursor-pointer ${isDark ? "bg-white/10 hover:bg-white/20 text-white" : "bg-[#f3f3f8] hover:bg-[#e7e7f3] text-[#111]"
            }`}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <CustomConnect />

        <button
          className={`md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5 ${isDark ? "text-white" : "text-[#111]"
            }`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span
            className={`block w-5 h-0.5 transition-all duration-300 ${isDark ? "bg-white" : "bg-[#111]"
              } ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`}
          />
          <span
            className={`block w-5 h-0.5 transition-all duration-300 ${isDark ? "bg-white" : "bg-[#111]"
              } ${mobileMenuOpen ? "opacity-0" : ""}`}
          />
          <span
            className={`block w-5 h-0.5 transition-all duration-300 ${isDark ? "bg-white" : "bg-[#111]"
              } ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`}
          />
        </button>
      </div>

      <div
        className={`absolute top-full left-0 right-0 md:hidden overflow-hidden transition-all duration-300 ${mobileMenuOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
          } ${isDark ? "bg-[#0a0a0f]/95 border-b border-white/10" : "bg-white/95 border-b border-black/5"}`}
      >
        <div className="flex flex-col py-4 px-6 gap-1">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className={`py-3 px-4 rounded-xl text-sm font-medium transition ${isDark ? "text-white hover:bg-white/5" : "text-[#111] hover:bg-black/5"
              }`}
          >
            Home
          </Link>
          <Link
            href="/academy"
            onClick={() => setMobileMenuOpen(false)}
            className={`py-3 px-4 rounded-xl text-sm transition hover:bg-black/5 ${isDark ? "text-gray-300 hover:bg-white/5" : "text-[#555]"
              }`}
          >
            Academy
          </Link>
          <Link
            href="/academy"
            onClick={() => setMobileMenuOpen(false)}
            className={`py-3 px-4 rounded-xl text-sm transition hover:bg-black/5 ${isDark ? "text-gray-300 hover:bg-white/5" : "text-[#555]"
              }`}
          >
            Campaigns
          </Link>
          <Link
            href="/certificates"
            onClick={() => setMobileMenuOpen(false)}
            className={`py-3 px-4 rounded-xl text-sm transition hover:bg-black/5 ${isDark ? "text-gray-300 hover:bg-white/5" : "text-[#555]"
              }`}
          >
            Certificates
          </Link>
          <div
            className={`flex items-center gap-4 mt-2 pt-3 px-4 border-t ${isDark ? "border-white/10" : "border-black/5"
              }`}
          >
            <a href="https://x.com/SafuVerse" target="_blank" rel="noopener noreferrer" className={`opacity-80 hover:opacity-100 transition ${isDark ? "text-white" : "text-[#111]"}`}>
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
            <a href="https://discord.gg/safuverse" target="_blank" rel="noopener noreferrer" className="text-[#5865F2] opacity-80 hover:opacity-100 transition">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.8730.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9460 2.4189-2.1568 2.4189z" /></svg>
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;
