'use client';

import { CustomConnect } from '@/components/connectButton'
import { useAccount } from 'wagmi'
import { IdentificationIcon, SearchIcon } from '@heroicons/react/outline'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const THEME_KEY = 'nexid-theme'

export const MobileNav = () => {
  const { isConnected } = useAccount()
  const router = useRouter()
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored)
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
    }

    // Listen for body class changes (when nav toggles dark mode)
    const observer = new MutationObserver(() => {
      const isDarkMode = document.body.classList.contains('dark-mode')
      setTheme(isDarkMode ? 'dark' : 'light')
    })

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    // Check initial state from body class
    if (document.body.classList.contains('dark-mode')) {
      setTheme('dark')
    }

    return () => observer.disconnect()
  }, [])

  const isDark = theme === 'dark'

  return (
    <div>
      <div
        className="md:hidden fixed bottom-5 left-1/2 z-10 transform -translate-x-1/2 inline-flex items-center space-x-4 px-4 py-3 rounded-full shadow-lg max-w-max whitespace-nowrap justify-center"
        style={{
          background: isDark ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(14px)',
          border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 18px 45px rgba(0,0,0,0.15)',
        }}
      >
        {/* Search button */}
        <button
          className="p-2 rounded-full transition-all hover:opacity-70"
          style={{
            background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4',
          }}
          onClick={() => router.push(`/`)}
        >
          <SearchIcon
            className="w-6 h-6"
            style={{ color: isDark ? '#f5f5f5' : '#111' }}
          />
        </button>

        {/* Profile button */}
        {isConnected && (
          <button
            className="p-2 rounded-full transition-all hover:opacity-70"
            style={{
              background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4',
            }}
            onClick={() => router.push(`/dashboard`)}
          >
            <IdentificationIcon
              className="w-6 h-6"
              style={{ color: isDark ? '#f5f5f5' : '#111' }}
            />
          </button>
        )}

        <CustomConnect />
      </div>
    </div>
  )
}
