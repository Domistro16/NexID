'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useReadContract, useChainId } from 'wagmi'
import { CustomConnect } from '@/components/connectButton'
import { getConstants } from '../constant'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Menu, X, ArrowRight } from 'lucide-react'

const abi = [
  {
    inputs: [{ internalType: 'string', name: 'name', type: 'string' }],
    name: 'available',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
]

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState('')
  const [available, setAvailable] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)

  const chainId = useChainId()
  const constants = getConstants(chainId)

  const { data, isPending } = useReadContract({
    address: constants.Controller,
    functionName: 'available',
    abi: abi,
    args: [search],
  })

  useEffect(() => {
    if (search.length < 1) {
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

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showResults &&
        inputRef.current &&
        resultsRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        !resultsRef.current.contains(event.target as Node)
      ) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showResults])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().trim()
    setSearch(val)
    setShowResults(val.length > 0)
  }

  const handleRoute = () => {
    if (available === 'Available') {
      router.push(`/register/${search}`)
      setShowResults(false)
      setMobileMenuOpen(false)
    }
  }

  const navLinks = [
    { label: 'Pricing', href: '/pricing', isExternal: false },
    { label: 'API', href: '/api-docs', isExternal: false },
    { label: 'NexID Academy', href: 'https://academy.nexdomains.com/courses/all', isExternal: true },
  ]

  const isHomepage = pathname === '/'

  return (
    <>
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="nav-pill-container"
      >
        <div className="nav-pill">
          {/* Logo */}
          <div className="nav-pill-left">
            <div className="nav-pill-logo" onClick={() => router.push('/')}>
              <img src="/nexid_logo.png" alt="NexId" />
            </div>
          </div>

          {/* Search - non-homepage only, desktop */}
          {!isHomepage && (
            <div className="nav-pill-search hidden md:block">
              <div className="nav-pill-search-inner">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search names..."
                  onChange={handleSearch}
                  value={search}
                />
              </div>
              {showResults && search && (
                <div ref={resultsRef} className="nav-pill-search-results">
                  <div className="nav-pill-search-result" onClick={handleRoute}>
                    <span className="font-semibold text-sm text-white">{search}.id</span>
                    {available && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{
                          background: available === 'Available' ? '#00C853' : available === 'Registered' ? '#f59e0b' : '#666',
                          color: '#fff',
                        }}
                      >
                        {available}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="nav-pill-spacer" />

          {/* Desktop Nav Links */}
          <div className="nav-pill-links hidden md:flex">
            {navLinks.map((link) =>
              link.isExternal ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-pill-link"
                >
                  {link.label}
                </a>
              ) : (
                <div
                  key={link.label}
                  onClick={() => router.push(link.href)}
                  className={`nav-pill-link ${pathname === link.href ? 'active' : ''}`}
                >
                  {link.label}
                </div>
              )
            )}
          </div>

          {/* Connect Button */}
          <div className="nav-pill-connect hidden md:block">
            <CustomConnect />
          </div>

          {/* Mobile Menu Button */}
          <div className="nav-pill-mobile md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="nav-pill-mobile-trigger"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="nav-pill-mobile-menu"
            >
              {/* Mobile Search */}
              {!isHomepage && (
                <div className="nav-pill-mobile-search">
                  <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search names..."
                    onChange={handleSearch}
                    value={search}
                  />
                </div>
              )}

              {showResults && search && !isHomepage && (
                <div className="nav-pill-mobile-result" onClick={handleRoute}>
                  <span className="font-semibold text-sm text-white">{search}.id</span>
                  {available && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                      style={{
                        background: available === 'Available' ? '#00C853' : available === 'Registered' ? '#f59e0b' : '#666',
                        color: '#fff',
                      }}
                    >
                      {available}
                    </span>
                  )}
                </div>
              )}

              {navLinks.map((link) =>
                link.isExternal ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nav-pill-mob-link"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                    <ArrowRight className="w-4 h-4 opacity-40" />
                  </a>
                ) : (
                  <div
                    key={link.label}
                    onClick={() => {
                      router.push(link.href)
                      setMobileMenuOpen(false)
                    }}
                    className="nav-pill-mob-link"
                  >
                    {link.label}
                    <ArrowRight className="w-4 h-4 opacity-40" />
                  </div>
                )
              )}

              <div className="nav-pill-mob-link" onClick={() => { router.push('/dashboard'); setMobileMenuOpen(false) }}>
                Dashboard
                <ArrowRight className="w-4 h-4 opacity-40" />
              </div>

              <div className="nav-pill-mobile-connect">
                <CustomConnect />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
    </>
  )
}
