'use client';

import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useReadContract, useChainId } from 'wagmi'
import { IdentificationIcon } from '@heroicons/react/outline'
import { CustomConnect } from '@/components/connectButton'
import { getConstants } from '../constant'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, X, Menu, Search } from 'lucide-react'

const THEME_KEY = 'nexid-theme'

const abi = [
  {
    inputs: [
      {
        internalType: 'string',
        name: 'name',
        type: 'string',
      },
    ],
    name: 'available',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
]

export default function Nav() {
  const router = useRouter()
  const pathname = usePathname()
  const [available, setAvailable] = useState('')
  const [search, setSearch] = useState('')
  const [isScrolled, setIsScrolled] = useState(false)
  const [theme, setTheme] = useState('light')

  const chainId = useChainId()
  const constants = getConstants(chainId)

  const { data, isPending } = useReadContract({
    address: constants.Controller,
    functionName: 'available',
    abi: abi,
    args: [search],
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  const [showBox, setShowBox] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const mobileInputRef = useRef<HTMLInputElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const mobileBoxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY)
    let initialTheme = 'light'

    if (stored === 'light' || stored === 'dark') {
      initialTheme = stored
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      initialTheme = 'dark'
    }

    setTheme(initialTheme)
    // Apply the body class immediately
    document.body.classList.toggle('dark-mode', initialTheme === 'dark')
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinks = [
    {
      href: '/auctions',
      label: '🏆 Auctions',
      isExternal: false,
      isNew: true,
    },
    {
      href: 'https://nexdomains.gitbook.io/nexdomains-docs/',
      label: 'Docs',
      isExternal: true,
    },
  ]

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showBox &&
        inputRef.current &&
        boxRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        !boxRef.current.contains(event.target as Node)
      ) {
        setShowBox(false)
      }
      // Handle mobile search box
      if (
        showBox &&
        mobileInputRef.current &&
        mobileBoxRef.current &&
        !mobileInputRef.current.contains(event.target as Node) &&
        !mobileBoxRef.current.contains(event.target as Node)
      ) {
        setShowBox(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showBox])

  useEffect(() => {
    if (search.length < 2) {
      setAvailable('Too Short')
    } else if (isPending) {
      setAvailable('Loading...')
    } else if (data === true) {
      setAvailable('Available')
    } else if (data === false) {
      setAvailable('Registered')
    } else {
      setAvailable('')
    }
  }, [search, isPending, data])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    setSearch(e.target.value)
    if (e.target.value.length > 0) {
      setShowBox(true)
    } else {
      setShowBox(false)
    }
  }

  const route = () => {
    if (available == 'Available') {
      router.push(`/register/${search}`)
      setMobileSearchOpen(false)
      setMobileMenuOpen(false)
    }
    // Do nothing if domain is already registered
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    window.localStorage.setItem(THEME_KEY, nextTheme)
    document.body.classList.toggle('dark-mode', nextTheme === 'dark')
  }

  const isDark = theme === 'dark'

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false)
    setMobileSearchOpen(false)
  }, [pathname])

  return (
    <motion.nav
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className="top-nav"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        maxWidth: '100%',
        margin: '0 auto',
        zIndex: 999,
        transition: 'all 0.3s ease',
        background: isDark
          ? 'radial-gradient(circle at 0% 0%, rgba(255,255,255,0.08), rgba(8,8,8,0.96))'
          : isScrolled
            ? 'rgba(255,255,255,0.85)'
            : 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(14px)',
        borderBottom: isDark
          ? '1px solid rgba(255,255,255,0.08)'
          : '1px solid rgba(0,0,0,0.06)',
        boxShadow: isScrolled ? '0 10px 40px rgba(0,0,0,0.1)' : 'none',
      }}
    >
      <div className="flex justify-between items-center h-[60px] sm:h-[70px] w-full max-w-[1400px] mx-auto px-3 sm:px-4 md:px-8">
        {/* Logo */}
        <div onClick={() => router.push('/')} className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
          <img
            src="/nexid_logo.png"
            className="h-8 sm:h-10 hidden sm:block"
            alt="nexid"
          />
          <img
            src="/nexid_logo.png"
            className="h-10 sm:hidden block"
            alt="nexid"
          />
        </div>

        {/* Search Bar - Desktop/Tablet (Hidden on Homepage & Mobile) */}
        <div
          className={`ml-3 sm:ml-5 relative flex-1 max-w-[400px] ${pathname == '/' ? 'hidden' : 'hidden sm:block'}`}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Search for a name"
            onChange={handleChange}
            className="w-full px-4 sm:px-6 py-2 rounded-full text-[14px] sm:text-[15px] transition-all"
            style={{
              background: isDark ? 'rgba(255,255,255,0.07)' : '#fff',
              border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
              color: isDark ? '#fff' : '#111',
              outline: 'none',
            }}
          />

          {/* Search Results Popup */}
          <div
            ref={boxRef}
            className={`absolute left-0 right-0 mt-2 rounded-2xl shadow-lg text-left z-10 origin-top
              transition-transform duration-300 ease-out
              overflow-hidden ${showBox ? 'scale-y-100' : 'scale-y-0'}`}
            style={{
              background: isDark ? 'rgba(30,30,30,0.95)' : '#fff',
              border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
            }}
          >
            <ul className="divide-y" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
              <li
                className="px-4 sm:px-6 py-3 cursor-pointer flex items-center justify-between transition-all hover:opacity-80"
                onClick={route}
              >
                <div className="text-[14px] sm:text-[15px] font-semibold" style={{ color: isDark ? '#fff' : '#111' }}>
                  {search != '' ? search + '.id' : ''}
                </div>
                {available != '' && search != '' && (
                  <div
                    className="text-[10px] sm:text-[11px] px-2 sm:px-3 py-1 rounded-full"
                    style={{
                      background: available === 'Available' ? '#14d46b' : available === 'Registered' ? '#f59e0b' : '#888',
                      color: '#fff',
                    }}
                  >
                    {available}
                  </div>
                )}
              </li>
            </ul>
          </div>
        </div>

        {/* Desktop Navigation - Hidden on smaller screens */}
        <div className="hidden lg:flex items-center gap-4 xl:gap-6 flex-shrink-0">
          <div
            className="flex items-center gap-1 cursor-pointer font-semibold transition-all hover:opacity-70 text-sm xl:text-base"
            style={{ color: isDark ? '#f5f5f5' : '#111' }}
            onClick={() => router.push(`/dashboard`)}
          >
            <IdentificationIcon className="w-4 h-4 xl:w-5 xl:h-5 flex-shrink-0" />
            <span className="whitespace-nowrap">Dashboard</span>
          </div>

          {navLinks.map((link) =>
            link.isExternal ? (
              <a
                key={link.label}
                href={link.href}
                className="font-semibold transition-all hover:opacity-70 text-sm xl:text-base"
                style={{ color: isDark ? '#f5f5f5' : '#111' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ) : (
              <div
                key={link.label}
                onClick={() => router.push(link.href)}
                className="flex items-center gap-1 cursor-pointer font-semibold transition-all hover:opacity-70 text-sm xl:text-base"
                style={{ color: isDark ? '#f5f5f5' : '#111' }}
              >
                {link.label}
                {link.isNew && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500 text-black rounded-full font-bold">
                    NEW
                  </span>
                )}
              </div>
            )
          )}

          <a
            href="https://academy.nexdomains.com/courses/all"
            className="flex items-center font-semibold transition-all hover:opacity-70 text-sm xl:text-base"
            style={{ color: isDark ? '#f5f5f5' : '#111' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BookOpen className="w-4 h-4 mr-1" />
            <span className="whitespace-nowrap">Academy</span>
          </a>

          <button
            className="dark-toggle-btn flex-shrink-0"
            type="button"
            onClick={toggleTheme}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: isDark ? '#222' : '#eee',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
            }}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          <CustomConnect />
        </div>

        {/* Tablet Navigation (md to lg) */}
        <div className="hidden sm:flex lg:hidden items-center gap-3 flex-shrink-0">
          <button
            className="dark-toggle-btn"
            type="button"
            onClick={toggleTheme}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: isDark ? '#222' : '#eee',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
            }}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          <CustomConnect />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: isDark ? '#222' : '#f4f4f4',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {mobileMenuOpen ? (
              <X size={20} style={{ color: isDark ? '#fff' : '#111' }} />
            ) : (
              <Menu size={20} style={{ color: isDark ? '#fff' : '#111' }} />
            )}
          </button>
        </div>

        {/* Mobile Navigation (< sm) */}
        <div className="flex sm:hidden items-center gap-2 flex-shrink-0">
          {/* Mobile Search Button - Only show on non-homepage */}
          {pathname !== '/' && (
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: isDark ? '#222' : '#f4f4f4',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Search size={18} style={{ color: isDark ? '#fff' : '#111' }} />
            </button>
          )}
          <button
            className="dark-toggle-btn"
            type="button"
            onClick={toggleTheme}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: isDark ? '#222' : '#eee',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
            }}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: isDark ? '#222' : '#f4f4f4',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {mobileMenuOpen ? (
              <X size={18} style={{ color: isDark ? '#fff' : '#111' }} />
            ) : (
              <Menu size={18} style={{ color: isDark ? '#fff' : '#111' }} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Search Bar */}
      <AnimatePresence>
        {mobileSearchOpen && pathname !== '/' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="sm:hidden"
            style={{
              position: 'relative',
              width: '100%',
              padding: '0 12px 12px 12px',
              background: isDark ? 'rgba(10,10,10,0.98)' : 'rgba(255,255,255,0.98)',
              borderTop: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                ref={mobileInputRef}
                type="text"
                placeholder="Search for a name"
                onChange={handleChange}
                value={search}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  fontSize: '15px',
                  background: isDark ? 'rgba(255,255,255,0.08)' : '#f5f5f5',
                  border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.06)',
                  color: isDark ? '#fff' : '#111',
                  outline: 'none',
                }}
              />
              {/* Mobile Search Results */}
              {showBox && search && (
                <div
                  ref={mobileBoxRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '100%',
                    marginTop: '8px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    background: isDark ? 'rgba(25,25,25,0.98)' : '#fff',
                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
                  }}
                >
                  <div
                    onClick={route}
                    style={{
                      padding: '14px 16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '15px', fontWeight: 600, color: isDark ? '#fff' : '#111' }}>
                      {search}.id
                    </span>
                    {available && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          background: available === 'Available' ? '#14d46b' : available === 'Registered' ? '#f59e0b' : '#888',
                          color: '#fff',
                          fontWeight: 500,
                        }}
                      >
                        {available}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile/Tablet Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden"
            style={{
              width: '100%',
              padding: '20px 16px',
              background: isDark ? 'rgba(10,10,10,0.98)' : 'rgba(255,255,255,0.98)',
              borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div
                onClick={() => {
                  router.push(`/dashboard`)
                  setMobileMenuOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '15px',
                  color: isDark ? '#f5f5f5' : '#111',
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  width: '100%',
                  maxWidth: '280px',
                  justifyContent: 'center',
                }}
              >
                <IdentificationIcon style={{ width: '20px', height: '20px' }} />
                <span>Dashboard</span>
              </div>

              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    borderRadius: '12px',
                    fontWeight: 600,
                    fontSize: '15px',
                    color: isDark ? '#f5f5f5' : '#111',
                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    width: '100%',
                    maxWidth: '280px',
                    justifyContent: 'center',
                    textDecoration: 'none',
                  }}
                >
                  {link.label}
                </a>
              ))}

              <a
                href="https://academy.nexdomains.com/courses/all"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  fontWeight: 600,
                  fontSize: '15px',
                  color: isDark ? '#f5f5f5' : '#111',
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  width: '100%',
                  maxWidth: '280px',
                  justifyContent: 'center',
                  textDecoration: 'none',
                }}
              >
                <BookOpen style={{ width: '16px', height: '16px' }} />
                Academy
              </a>

              {/* Show Connect button only on mobile */}
              <div className="sm:hidden" style={{ paddingTop: '8px', width: '100%', maxWidth: '280px' }}>
                <CustomConnect />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
