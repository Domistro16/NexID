'use client';

import { useState, useEffect, useRef } from 'react'
import { useReadContract } from 'wagmi'
import { useRouter, useSearchParams } from 'next/navigation'
import { keccak256, toBytes, zeroAddress } from 'viem'
import { constants } from '../constant'
import { FaSearch } from 'react-icons/fa'
import { AgentRegistrarControllerAbi as abi } from '@nexid/sdk'

const reservedOwnersAbi = [
  {
    inputs: [{ name: '', type: 'bytes32' }],
    name: 'reservedOwners',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const THEME_KEY = 'nexid-theme'

function getPreferredTheme() {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

const faqItems = [
  {
    q: 'What is a .id domain?',
    a: 'A .id domain is your decentralized Web3 identity on the BSC. It replaces long wallet addresses with human-readable names.',
  },
  {
    q: 'How do I register a domain?',
    a: 'Simply search for your desired name above, check availability, and follow the registration process. You can pay with BNB, CAKE, or USD1.',
  },
  {
    q: 'What can I do with my domain?',
    a: 'Use it as your universal Web3 identity, receive payments, access exclusive features in the NexDomains ecosystem, and more.',
  },
  {
    q: 'How long does registration last?',
    a: 'You can register for 1+ years or choose lifetime registration. Renewals are available before expiry.',
  },
  {
    q: 'Is my domain an NFT?',
    a: 'Yes! Your .id domain is a fully tradeable NFT that you own and control.',
  },
  {
    q: 'What about referrals?',
    a: 'Share your referral link and earn rewards when others register domains using your link.',
  },
]

export default function Home() {
  const router = useRouter()
  const [theme, setTheme] = useState('light')
  const isDark = theme === 'dark'
  const [available, setAvailable] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  const { data, isPending, error } = useReadContract({
    address: constants.Controller,
    functionName: 'available',
    abi: abi,
    args: [search],
  })

  const labelHash = search ? keccak256(toBytes(search)) : undefined
  const { data: reservedOwner, isLoading: reservedLoading } = useReadContract({
    address: constants.Controller,
    abi: reservedOwnersAbi,
    functionName: 'reservedOwners',
    args: labelHash ? [labelHash] : undefined,
  })
  const isReserved = !!reservedOwner && reservedOwner !== zeroAddress

  console.log(error)
  const searchParams = useSearchParams()

  const ref = searchParams?.get('ref')

  useEffect(() => {
    if (ref) {
      localStorage.setItem('ref', ref)
    }
  }, [ref])

  useEffect(() => {
    const initial = getPreferredTheme()
    setTheme(initial)

    // Apply dark mode class based on initial theme
    document.body.classList.toggle('dark-mode', initial === 'dark')

    // Listen for body class changes (when nav toggles dark mode)
    const observer = new MutationObserver(() => {
      const isDarkMode = document.body.classList.contains('dark-mode')
      setTheme(isDarkMode ? 'dark' : 'light')
    })

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    // Media query listener for system preference
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (event: MediaQueryListEvent) => {
        if (!window.localStorage.getItem(THEME_KEY)) {
          setTheme(event.matches ? 'dark' : 'light')
        }
      }
      mq.addEventListener('change', handler)
      return () => {
        mq.removeEventListener('change', handler)
        observer.disconnect()
      }
    }

    return () => observer.disconnect()
  }, [])

  const [showBox, setShowBox] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    document.title = `id Domains - Get a Domain name with a id identity`
  }, [])

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
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showBox])

  useEffect(() => {
    if (search.includes('.')) {
      setAvailable('Invalid')
    } else if (search.length < 1) {
      setAvailable('Too Short')
    } else if (isPending || reservedLoading) {
      setAvailable('Loading...')
    } else if (data === true && isReserved) {
      setAvailable('Reserved')
    } else if (data === true) {
      setAvailable('Available')
    } else if (data === false) {
      setAvailable('Registered')
    } else {
      setAvailable('')
    }
  }, [search, isPending, data, isReserved, reservedLoading])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    setSearch(e.target.value.toLowerCase().trim())
    if (e.target.value.length > 0) {
      setShowBox(true)
    } else {
      setShowBox(false)
    }
  }

  const route = () => {
    if (available == 'Available') {
      router.push(`/register/${search}`)
    }
    // Do nothing if domain is already registered
  }

  const handleClickOutside = (event: MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])


  const handleFaqClick = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index))
  }

  return (
    <>
      <div className="hero-spacer" />

      {/* HERO SECTION */}
      <section className="hero-section-wrapper">
        <div className="soft-mist-bg" />
        <div className="hero-inner">
          <div className="hero-icon">
            <img src="/nexid_logo.png" alt="id" style={{ height: '40px' }} />
          </div>

          <div className="hero-pill">
            <span className="hero-pill-dot" />
            <span style={{ color: isDark ? '#fff' : '#111', fontWeight: 500 }}>Live on BSC</span>
          </div>

          <h1>
            Claim Your
            <br />
            <span>.id Domain Name</span>
          </h1>

          <p className="hero-subtext">
            Your digital identity across all Web3 platforms. Search your domain name below and make it yours.
          </p>

          <div className="email-box-wrapper">
            <div className="email-box-premium">
              <input
                type="text"
                placeholder="Search for a name"
                onClick={() => setOpen(true)}
                readOnly
                style={{ cursor: 'pointer' }}
              />
              <button type="button" onClick={() => setOpen(true)}>
                <FaSearch style={{ marginRight: '8px', display: 'inline' }} />
                Search
              </button>
            </div>
          </div>

          <div className="social-proof">
            <div className="social-avatars">
              <div className="social-avatar" style={{ backgroundImage: 'linear-gradient(135deg,#ddd,#bbb)' }} />
              <div className="social-avatar" style={{ backgroundImage: 'linear-gradient(135deg,#ccc,#aaa)' }} />
              <div className="social-avatar" style={{ backgroundImage: 'linear-gradient(135deg,#bbb,#999)' }} />
            </div>
            <span className="founder-text">Join thousands of Web3 users</span>
          </div>
        </div>
      </section>

      {/* Search Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
          <div
            ref={modalRef}
            className="page-card w-full max-w-xl"
            style={{ maxHeight: '80vh', overflow: 'auto' }}
          >
            <div className="email-box-premium" style={{ maxWidth: '100%', marginBottom: '20px' }}>
              <input
                ref={inputRef}
                placeholder="Search for a name"
                onChange={handleChange}
                value={search}
                style={{ color: theme === 'dark' ? '#fff' : '#111' }}
              />
              <button type="button" onClick={route}>
                <FaSearch />
              </button>
            </div>

            {showBox && search && (
              <div
                ref={boxRef}
                className="page-card"
                style={{ padding: '0', marginTop: '8px' }}
              >
                <div
                  className="flex items-center justify-between p-4 cursor-pointer transition-all hover:opacity-80"
                  onClick={route}
                  style={{ borderRadius: '14px' }}
                >
                  <span style={{ fontWeight: 600 }}>{search}.id</span>
                  {available && (
                    <span
                      style={{
                        fontSize: '12px',
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        background: available === 'Available' ? '#14d46b' : available === 'Registered' ? '#f59e0b' : available === 'Unavailable' ? '#ef4444' : '#888',
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
        </div>
      )}

      {/* FEATURES SECTION */}
      <section className="features">
        <div className="feature-card">
          <div className="feature-icon">🪪</div>
          <h3 style={{ fontSize: '18px', color: isDark ? '#f8f8f8' : '#111', fontWeight: 600, marginTop: '22px' }}>
            Web3 Identity
          </h3>
          <p style={{ fontSize: '14px', color: isDark ? '#ccc' : '#555', lineHeight: 1.55, marginTop: '10px' }}>
            Your .id name becomes your universal on-chain username across the NexDomains ecosystem.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🎓</div>
          <h3 style={{ fontSize: '18px', color: isDark ? '#f8f8f8' : '#111', fontWeight: 600, marginTop: '22px' }}>
            Academy Access
          </h3>
          <p style={{ fontSize: '14px', color: isDark ? '#ccc' : '#555', lineHeight: 1.55, marginTop: '10px' }}>
            Use your domain to access courses, AI tutors, and learning tools inside the NexDomains Academy.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">💰</div>
          <h3 style={{ fontSize: '18px', color: isDark ? '#f8f8f8' : '#111', fontWeight: 600, marginTop: '22px' }}>
            Referral Rewards
          </h3>
          <p style={{ fontSize: '14px', color: isDark ? '#ccc' : '#555', lineHeight: 1.55, marginTop: '10px' }}>
            Earn rewards when others register domains using your referral link.
          </p>
        </div>
      </section>

      {/* CONTENT SECTION */}
      <section className="content-section">
        <div className="soft-mist-bg" />
        <div className="content-inner" style={{ padding: '0 20px' }}>
          <div className="content-card">
            <div className="content-pill">About</div>
            <h2 className="content-title">Your Gateway to Web3 Identity</h2>
            <p className="content-text" style={{ marginBottom: '14px' }}>
              id Domains is the official naming service for the NexDomains ecosystem on BSC.
              Replace your long wallet address with a memorable .id name.
            </p>
            <p className="content-text">
              Own your identity, receive payments easily, and unlock exclusive features across the NexDomains platforms.
            </p>

            <div style={{ marginTop: '22px', fontSize: '14px', color: isDark ? '#ddd' : '#222' }}>
              <p><strong>Network:</strong> BSC</p>
              <p><strong>Extension:</strong> .id</p>
              <p><strong>Features:</strong> Utility beyond Identity</p>

            </div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="faq">
        <h2>
          <span className="faq-label">FAQ</span>
          <span style={{ fontSize: '32px', fontWeight: 600 }}>
            Frequently Asked{' '}
            <em style={{ fontFamily: 'Times New Roman, serif', fontStyle: 'italic' }}>Questions</em>
          </span>
        </h2>

        <div className="faq-grid">
          {faqItems.map((item, index) => {
            const isOpen = openFaqIndex === index
            return (
              <div
                key={index}
                className={`faq-item${isOpen ? ' open' : ''}`}
                onClick={() => handleFaqClick(index)}
              >
                <div className="faq-header">
                  <span>{item.q}</span>
                  <span className="faq-icon">+</span>
                </div>
                <p className="faq-answer">{item.a}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <section className="footer-promo">
            <div className="footer-promo-bg" />
            <h2 className="footer-title">
              Explore the NexDomains
              <br />
              Ecosystem
            </h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <a href="https://academy.nexdomains.com/courses/all" target="_blank" rel="noopener noreferrer">
                <button className="footer-btn" type="button">
                  Visit Academy
                </button>
              </a>
              <a href="https://safupad.xyz" target="_blank" rel="noopener noreferrer">
                <button className="footer-btn" type="button" style={{ background: 'linear-gradient(135deg, #FFB000 0%, #FFD700 100%)', color: '#000' }}>
                  Launch SafuPad
                </button>
              </a>
            </div>
          </section>

          <div className="footer-actions">
            <a href="https://nexdomains.gitbook.io/nexdomains-docs/" target="_blank" rel="noopener noreferrer">
              <button className="footer-chip" type="button">
                📄 Documentation
              </button>
            </a>
            <a href="https://nexdomains.com" target="_blank" rel="noopener noreferrer">
              <button className="footer-chip" type="button">
                🌐 Main Website
              </button>
            </a>
          </div>

          <div className="footer-copy">NexDomains 2025. All rights reserved.</div>
        </div>
      </footer>
    </>
  )
}
