import React from 'react'
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

const Navbar = () => {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <nav className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-black/5 bg-white/60 px-4 backdrop-blur-md dark:border-white/10 dark:bg-black/70 md:h-18 md:px-8">
      <div className="flex items-center gap-3 shrink-0 group">
        <img src="/nexid.png" className="h-12 w-auto" alt="NexID" />
      </div>

      <div className="flex items-center gap-4 text-sm md:gap-6 md:text-base">
        <button
          className="rounded-full border border-slate-200 bg-white/50 px-4 py-1.5 text-sm font-medium text-slate-700 transition-all hover:border-[#ffb000] hover:text-[#ffb000] dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-[#ffb000] dark:hover:text-[#ffb000]"
        >
          Login
        </button>
        <button
          onClick={toggleTheme}
          className="rounded-full bg-slate-100 flex items-center justify-center w-9 h-9 text-lg shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-800 border border-transparent hover:border-[#ffb000]/20"
          aria-label="Toggle theme"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>
    </nav>
  )
}

export default Navbar