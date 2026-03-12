'use client'

import { useState, useEffect, useRef } from 'react'
import { useReadContract } from 'wagmi'
import { useRouter, useSearchParams } from 'next/navigation'
import { keccak256, toBytes, zeroAddress } from 'viem'
import { constants } from '../constant'
import {
  Search, X, CheckCircle2, XCircle, Wallet,
  CreditCard, Plus, Box, Diamond, Zap, GraduationCap,
  User, Loader, ShieldCheck, Twitter, MessageCircle,
  History, Check, ArrowUp, ArrowLeft, ArrowRight,
} from 'lucide-react'

const abi = [
  {
    inputs: [{ internalType: 'string', name: 'name', type: 'string' }],
    name: 'available',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const reservedOwnersAbi = [
  {
    inputs: [{ name: '', type: 'bytes32' }],
    name: 'reservedOwners',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const faqItems = [
  { q: 'What exactly is a .id name?', a: "It's your universal identity for the decentralized web. A single .id name replaces clunky wallet addresses for payments, works as your username across social dApps, and serves as a verified identity for AI agents across Base, Ethereum, Solana, and more." },
  { q: 'How does the 25% revenue share work?', a: 'Every .id holder gets a unique referral link. When someone mints a name using your link, you instantly receive a 25% commission of the minting fee directly to your wallet. Built-in at the smart contract level.' },
  { q: 'Is this a subscription service?', a: 'No. Once you mint your .id name, it is an NFT that you own forever in your wallet. There are no annual renewal fees, no rent, and no hidden costs.' },
  { q: 'Can AI agents actually use this?', a: 'Yes. NexID embeds x402 and EIP-8004 standards, allowing autonomous AI agents to programmatically mint, manage, and transact using .id identities via our API.' },
  { q: 'Which wallets are supported?', a: 'We support all major Web3 wallets including MetaMask, Coinbase Wallet, Phantom, Rainbow, and any wallet that supports standard NFT assets on the Base network.' },
]

export default function Landing() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStage, setModalStage] = useState<'search' | 'timer' | 'payment' | 'guide'>('search')
  const [search, setSearch] = useState('')
  const [heroSubmitted, setHeroSubmitted] = useState(false)
  const [available, setAvailable] = useState('')
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)
  const [secTab, setSecTab] = useState(0)
  const [backToTopVisible, setBackToTopVisible] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modalInputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<HTMLDivElement>(null)
  const tabIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const ref = searchParams?.get('ref')
  useEffect(() => { if (ref) localStorage.setItem('ref', ref) }, [ref])

  const { data, isPending } = useReadContract({
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
  const normalizedSearch = search.toLowerCase().replace(/[^a-z0-9-]/g, '')
  const canRouteToRegister = available === 'Available' && normalizedSearch.length >= 1

  /* availability status */
  useEffect(() => {
    if (search.includes('.')) setAvailable('Invalid')
    else if (search.length < 1) setAvailable('Too Short')
    else if (isPending || reservedLoading) setAvailable('Loading...')
    else if (data === true && isReserved) setAvailable('Reserved')
    else if (data === true) setAvailable('Available')
    else if (data === false) setAvailable('Registered')
    else setAvailable('')
  }, [search, isPending, data, isReserved, reservedLoading])

  /* scroll handler */
  useEffect(() => {
    const onScroll = () => {
      setBackToTopVisible(window.scrollY > 500)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [])

  /* security tab auto-rotate */
  useEffect(() => {
    const next = () => setSecTab(t => (t + 1) % 3)
    tabIntervalRef.current = setInterval(next, 5000)
    return () => { if (tabIntervalRef.current) clearInterval(tabIntervalRef.current) }
  }, [])

  const switchSecTab = (i: number) => {
    setSecTab(i)
    if (tabIntervalRef.current) clearInterval(tabIntervalRef.current)
    tabIntervalRef.current = setInterval(() => setSecTab(t => (t + 1) % 3), 5000)
  }

  /* star canvas for footer */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const stars: { x: number; y: number; size: number; speed: number; opacity: number }[] = []

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = 600 }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < 100; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2,
        speed: Math.random() * 0.5 + 0.1,
        opacity: Math.random(),
      })
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      stars.forEach(s => {
        s.y -= s.speed
        if (s.y < 0) s.y = canvas.height
        s.opacity = Math.random() * 0.5 + 0.3
        ctx.fillStyle = `rgba(255,255,255,${s.opacity})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      })
      animId = requestAnimationFrame(animate)
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) animate()
        else cancelAnimationFrame(animId)
      })
    })

    const footer = canvas.closest('.landing-footer')
    if (footer) observer.observe(footer)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      observer.disconnect()
    }
  }, [])

  const handleRoute = () => {
    if (canRouteToRegister) {
      router.push(`/register/${normalizedSearch}`)
    }
  }

  const openModal = () => {
    setModalOpen(true)
    setSearch('')
    setModalStage('search')
    setTimeout(() => modalInputRef.current?.focus(), 100)
  }

  const handleClaim = () => {
    setModalStage('timer')
    setTimeout(() => {
      if (timerRef.current) timerRef.current.style.width = '100%'
    }, 100)
    setTimeout(() => setModalStage('payment'), 3000)
  }

  const resolveHeroDomain = () => {
    if (!normalizedSearch) return
    if (normalizedSearch !== search) setSearch(normalizedSearch)
    setHeroSubmitted(true)
  }

  return (
    <div id="landing-view">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#1a1a1a] bg-[#030303]">
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-30"
          style={{
            backgroundImage: "url('https://www.transparenttextures.com/patterns/stardust.png')",
            animation: 'landingNexidPan 180s linear infinite',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundSize: '50px 50px',
            backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)',
            maskImage: 'radial-gradient(ellipse at top, black 40%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse at top, black 40%, transparent 80%)',
          }}
        />

        <div className="relative z-10 w-full max-w-4xl mx-auto px-6 pt-28 md:pt-36 pb-24">
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ffb0004d] bg-[#ffb0000d] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#ffb000]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ffb000] animate-pulse" />
              The Root Registry
            </div>
            <h1 className="mt-6 text-5xl font-black tracking-tight text-white md:text-6xl lg:text-7xl">
              Establish your <span className="bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent">domain.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-[#8a8a8a] md:text-lg">
              Your identity, wallet, and sovereign transcript, permanently anchored to a single human-readable name.
            </p>
          </div>

          <div className="relative">
            <div className="rounded-[1.5rem] border border-[#1a1a1a] border-t-[#222] bg-[#050505e6] p-3 shadow-[0_30px_60px_rgba(0,0,0,0.8)] backdrop-blur-xl md:p-4">
              <div className="flex items-center">
                <Search className="ml-4 mr-4 h-7 w-7 shrink-0 text-[#8a8a8a] md:h-8 md:w-8" />
                <div className="flex flex-1 items-baseline">
                  <input
                    type="text"
                    className="w-full bg-transparent text-3xl font-bold text-white outline-none placeholder:text-[#222] md:text-5xl"
                    placeholder="vitalik"
                    autoComplete="off"
                    spellCheck={false}
                    value={search}
                    onChange={(e) => setSearch(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') resolveHeroDomain()
                    }}
                  />
                  <span className="ml-1 select-none text-3xl font-black text-[#ffb00080] md:text-5xl">.id</span>
                </div>
                <button
                  onClick={resolveHeroDomain}
                  className="ml-4 hidden shrink-0 items-center gap-2 rounded-xl bg-[#ffb000] px-6 py-4 text-lg font-bold text-black transition-all hover:shadow-[0_0_60px_-10px_rgba(255,176,0,0.4)] active:scale-95 md:flex md:px-10 md:py-5"
                >
                  Search
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <button
              onClick={resolveHeroDomain}
              className="mt-4 w-full rounded-xl bg-[#ffb000] py-4 text-lg font-bold text-black shadow-[0_0_60px_-10px_rgba(255,176,0,0.4)] transition-all active:scale-95 md:hidden"
            >
              Search Namespace
            </button>

            {heroSubmitted && search.length >= 1 && (
              <div className="mt-6">
                {available === 'Loading...' ? (
                  <div className="rounded-2xl border border-[#ffb0004d] bg-[#050505] p-5">
                    <div className="flex items-center gap-3 text-[#ffb000]">
                      <Loader className="h-5 w-5 animate-spin" />
                      <span className="font-mono text-xs uppercase tracking-[0.18em]">Checking Availability...</span>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`rounded-2xl border p-5 transition-all ${available === 'Available'
                    ? 'border-green-500/30 bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.05),transparent_60%)]'
                    : 'border-red-500/20 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.05),transparent_60%)]'} ${canRouteToRegister ? 'cursor-pointer hover:border-green-400/50 hover:bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.12),transparent_65%)]' : ''}`}
                    onClick={canRouteToRegister ? handleRoute : undefined}
                    onKeyDown={canRouteToRegister ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleRoute()
                      }
                    } : undefined}
                    role={canRouteToRegister ? 'button' : undefined}
                    tabIndex={canRouteToRegister ? 0 : undefined}
                  >
                    <div className="flex items-center gap-3">
                      {available === 'Available' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8a8a8a]">{search}.id</p>
                    </div>
                    <p className={`mt-2 text-lg font-bold ${available === 'Available' ? 'text-green-400' : 'text-red-400'}`}>
                      {available === 'Available' ? 'Available' : 'Not available'}
                    </p>
                    {canRouteToRegister && (
                      <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-green-300/80">
                        Click to register
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
      {/* ═══ SEARCH MODAL ═══ */}
      {modalOpen && (
        <div className={`landing-modal-overlay ${modalOpen ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="landing-modal-box">
            <div className="landing-modal-close" onClick={() => setModalOpen(false)}>
              <X className="w-6 h-6" />
            </div>

            {/* Stage: Search */}
            {modalStage === 'search' && (
              <div>
                <h3 className="landing-modal-title">Find your .id name</h3>
                <div className="landing-modal-input-container">
                  <input
                    ref={modalInputRef}
                    type="text"
                    className="landing-modal-input"
                    placeholder="nadya"
                    autoComplete="off"
                    spellCheck={false}
                    value={search}
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                      setSearch(val)
                    }}
                  />
                  <span className="landing-modal-suffix">.id</span>
                </div>

                {/* Search result card */}
                {search.length >= 1 && (
                  <div
                    className="flex items-center justify-center p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] mb-4 cursor-pointer transition-all hover:bg-[var(--accent)]"
                    onClick={handleRoute}
                  >
                    {available === 'Loading...' && (
                      <span className="text-xs px-3 py-1 rounded-full bg-gray-300 text-white font-semibold flex items-center gap-1.5">
                        <Loader className="w-3 h-3 animate-spin" /> Checking
                      </span>
                    )}
                    {available === 'Available' && (
                      <span className="text-xs px-3 py-1 rounded-full bg-green-500 text-white font-semibold">
                        Available
                      </span>
                    )}
                    {available === 'Unavailable' && (
                      <span className="text-xs px-3 py-1 rounded-full bg-red-500 text-white font-semibold">
                        Unavailable
                      </span>
                    )}
                    {available === 'Registered' && (
                      <span className="text-xs px-3 py-1 rounded-full bg-amber-500 text-white font-semibold">
                        Registered
                      </span>
                    )}
                    {available === 'Reserved' && (
                      <span className="text-xs px-3 py-1 rounded-full bg-violet-600 text-white font-semibold">
                        Reserved
                      </span>
                    )}
                    {available === 'Invalid' && (
                      <span className="text-xs px-3 py-1 rounded-full bg-red-500 text-white font-semibold">
                        Invalid
                      </span>
                    )}
                    {available === 'Too Short' && (
                      <span className="text-xs px-3 py-1 rounded-full bg-gray-400 text-white font-semibold">
                        Too Short
                      </span>
                    )}
                  </div>
                )}

                <button
                  className={`landing-claim-btn ${available === 'Available' ? 'active' : ''}`}
                  onClick={available === 'Available' ? handleRoute : undefined}
                >
                  Claim Now
                </button>
              </div>
            )}

            {/* Stage: Timer */}
            {modalStage === 'timer' && (
              <div className="text-center">
                <h3 className="landing-modal-title">Requesting Registration...</h3>
                <p className="text-gray-500 font-medium">Please wait while we check chain availability.</p>
                <div className="landing-timer-bar">
                  <div ref={timerRef} className="landing-timer-fill" style={{ width: '0%' }} />
                </div>
                <p className="text-xs text-gray-400 font-mono">Ensuring no front-running...</p>
              </div>
            )}

            {/* Stage: Payment */}
            {modalStage === 'payment' && (
              <div>
                <h3 className="landing-modal-title">Select Payment</h3>
                <p className="text-center text-muted-foreground font-medium">Secure your identity forever.</p>
                <div className="landing-payment-options">
                  <div className="landing-pay-opt rec" onClick={handleRoute}>
                    <div className="landing-pay-tag">Recommended</div>
                    <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white mb-2">
                      <Wallet className="w-6 h-6" />
                    </div>
                    <div className="font-bold text-lg">Crypto</div>
                    <div className="text-xs text-gray-500">Pay with ETH, USDC, or BASE</div>
                  </div>
                  <div className="landing-pay-opt" onClick={() => setModalStage('guide')}>
                    <div className="w-12 h-12 bg-[var(--secondary)] rounded-full flex items-center justify-center text-[var(--foreground)] mb-2">
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div className="font-bold text-lg">Card</div>
                    <div className="text-xs text-gray-500">Credit or Debit Card</div>
                  </div>
                </div>
              </div>
            )}

            {/* Stage: Crypto Guide */}
            {modalStage === 'guide' && (
              <div>
                <div className="flex items-center gap-2 mb-6 cursor-pointer text-gray-500 hover:text-black" onClick={() => setModalStage('payment')}>
                  <ArrowLeft className="w-4 h-4" /> <span className="text-sm font-bold">Back</span>
                </div>
                <h3 className="landing-modal-title text-2xl mb-2">Get USDC Instantly</h3>
                <p className="text-center text-gray-500 mb-8 text-sm">Purchase USDC with your card on trusted exchanges.</p>
                <a href="https://www.binance.com/en/buy-sell-crypto" target="_blank" rel="noopener noreferrer" className="landing-guide-card">
                  <div className="landing-guide-header"><div className="landing-guide-logo">BNB</div><div className="landing-guide-title">Binance</div></div>
                  <div className="landing-guide-text"><span className="landing-guide-pill">P2P</span> <span className="landing-guide-pill">Card</span> Global leader. Buy USDC directly with card or use P2P marketplace.</div>
                </a>
                <a href="https://www.coinbase.com/buy-crypto" target="_blank" rel="noopener noreferrer" className="landing-guide-card">
                  <div className="landing-guide-header"><div className="landing-guide-logo">CB</div><div className="landing-guide-title">Coinbase</div></div>
                  <div className="landing-guide-text"><span className="landing-guide-pill">Direct</span> <span className="landing-guide-pill">Easy</span> Simplest for beginners. Connect card for instant purchases.</div>
                </a>
                <a href="https://www.bybit.com/fiat/purchase/crypto" target="_blank" rel="noopener noreferrer" className="landing-guide-card">
                  <div className="landing-guide-header"><div className="landing-guide-logo">BY</div><div className="landing-guide-title">Bybit</div></div>
                  <div className="landing-guide-text"><span className="landing-guide-pill">P2P</span> <span className="landing-guide-pill">Global</span> Fast P2P and credit card options available worldwide.</div>
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ FEATURES SECTION ═══ */}
      <section className="landing-feature-section">
        <div className="landing-feature-header max-w-6xl mx-auto px-4">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight max-w-xl">The Bridge Between Web2 & Web3.</h2>
          <div className="flex flex-col gap-6 max-w-sm">
            <p className="text-gray-400 text-lg">Your .id domain is more than a name. It&apos;s an intelligent identity layer.</p>
            <button className="bg-white text-black px-8 py-4 rounded-full font-bold text-lg hover:bg-[#FFB000] transition-colors self-start" onClick={openModal}>Get Started</button>
          </div>
        </div>

        <div className="landing-grid-top max-w-6xl mx-auto">
          {/* Card: AI Minting API */}
          <div className="landing-bento-card">
            <div className="z-10">
              <span className="landing-feature-super">BUILT FOR AGENTS</span>
              <h3 className="landing-feature-title">AI Minting <br /> API.</h3>
              <p className="landing-feature-desc">Embeds x402 and EIP-8004 standards. AI agents can autonomously mint identities via simple API calls.</p>
            </div>
            <div className="landing-code-block">
              <div className="landing-code-line"><span className="landing-cl-num">1</span> <span style={{ color: '#F92672' }}>POST</span> /mint/safu</div>
              <div className="landing-code-line"><span className="landing-cl-num">2</span> {'{ "agent": "x402",'}</div>
              <div className="landing-code-line"><span className="landing-cl-num">3</span> &nbsp;&nbsp;{'"eip": "8004" }'}</div>
              <div className="landing-code-line"><span className="landing-cl-num">4</span> <span style={{ color: '#00C853' }}>// Success</span></div>
            </div>
          </div>

          {/* Card: Revenue Share */}
          <div className="landing-bento-card">
            <div className="z-10">
              <span className="landing-feature-super">REVENUE SHARE</span>
              <h3 className="landing-feature-title">Earn while <br /> you hold.</h3>
              <p className="landing-feature-desc">NexID Academy is free, but holders get exclusive access to courses with earning opportunities. Plus, 25% referral fees.</p>
            </div>
            <div className="landing-staking-dashboard">
              <div className="landing-sd-row"><span>Total Earnings</span> <span className="text-green-400">+12.5%</span></div>
              <h4 className="text-white text-3xl font-bold mb-4">$1,240.50</h4>
              <div className="landing-sd-graph">
                <div className="landing-sd-bar" style={{ height: '40%' }} />
                <div className="landing-sd-bar" style={{ height: '60%' }} />
                <div className="landing-sd-bar" style={{ height: '50%' }} />
                <div className="landing-sd-bar" style={{ height: '75%' }} />
                <div className="landing-sd-bar landing-sd-bar-accent" style={{ height: '100%' }} />
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-20 md:mt-32 mb-10 md:mb-16">
          <h2 className="landing-section-headline">Explore, create, and trade <br /> seamlessly in NexID.</h2>
        </div>

        <div className="landing-grid-bottom max-w-6xl mx-auto">
          {/* Cross-Chain */}
          <div className="landing-bento-card landing-tilted-1">
            <div className="landing-card-visual-area">
              <div className="flex gap-4">
                <div className="landing-sq-icon"><Box className="text-blue-500 w-8 h-8" /></div>
                <div className="landing-sq-icon"><Diamond className="text-purple-400 w-8 h-8" /></div>
                <div className="landing-sq-icon"><Zap className="text-teal-400 w-8 h-8" /></div>
              </div>
            </div>
            <div className="mt-auto">
              <span className="landing-feature-super">CROSS-CHAIN</span>
              <h3 className="landing-feature-title">One name, <br /> everywhere.</h3>
              <p className="landing-feature-desc">Use your unified .id identity seamlessly across Base, Ethereum, Solana, and beyond.</p>
            </div>
          </div>

          {/* Ownership */}
          <div className="landing-bento-card landing-tilted-2">
            <div className="landing-card-visual-area">
              <div className="flex items-center justify-center">
                <img src="https://i.pravatar.cc/120?img=8" alt="Human face" className="w-[60px] h-[60px] rounded-full border-[3px] border-[#161616] -mr-5 z-[1] object-cover" />
                <img src="https://i.pravatar.cc/120?img=21" alt="Human face" className="w-[60px] h-[60px] rounded-full border-[3px] border-[#161616] -mr-5 z-[2] object-cover" />
                <img src="https://i.pravatar.cc/120?img=58" alt="Human face" className="w-[60px] h-[60px] rounded-full border-[3px] border-[#161616] z-[3] object-cover" />
              </div>
            </div>
            <div className="mt-auto">
              <span className="landing-feature-super">TRUE OWNERSHIP</span>
              <h3 className="landing-feature-title">You are in <br /> control.</h3>
              <p className="landing-feature-desc">Your domain is a censorship-resistant NFT held in your wallet. Decentralized by design.</p>
            </div>
          </div>

          {/* Academy */}
          <div className="landing-bento-card landing-tilted-3">
            <div className="landing-card-visual-area">
              <div className="landing-academy-icon">
                <GraduationCap className="w-10 h-10" />
              </div>
            </div>
            <div className="mt-auto">
              <span className="landing-feature-super">NexID Academy</span>
              <h3 className="landing-feature-title">Learn & <br /> Earn.</h3>
              <p className="landing-feature-desc">Unlock premium educational content and exclusive earning opportunities for holders.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECURITY SECTION ═══ */}
      <section className="landing-security-section">
        <div className="landing-sec-grid">
          <div>
            <h2 className="landing-sec-title">Security that lets you <br /> sleep easy.</h2>
            <p className="landing-sec-desc">Advanced protection mechanisms built directly into your identity layer. You stay in control, always.</p>
            <div className="flex flex-col gap-4">
              {['Vault-Grade Ownership', 'Reputation & Trust', 'AI Guardian'].map((label, i) => (
                <button
                  key={i}
                  className={`landing-tab-btn ${secTab === i ? 'active' : ''}`}
                  onClick={() => switchSecTab(i)}
                >
                  <div className="landing-tab-label">{label}</div>
                  <div className="landing-progress-bar" />
                </button>
              ))}
            </div>
          </div>

          <div className={`landing-sec-stage ${secTab === 2 ? 'dark' : ''}`}>
            {/* Visual 0: Vault */}
            <div className={`landing-visual-card ${secTab === 0 ? 'active' : ''}`}>
              <div className="landing-vs-modal">
                <div className="font-bold border-b border-[var(--border)] pb-3 mb-3 text-[var(--foreground)]">Transfer Request</div>
                <div className="flex justify-between text-sm text-muted-foreground mb-2"><span>Asset</span><span className="font-semibold text-[var(--foreground)]">ceo.id</span></div>
                <div className="flex justify-between text-sm text-muted-foreground mb-4"><span>From</span><span className="font-semibold text-[var(--foreground)]">Vault A</span></div>
                <div className="flex gap-2 mb-5">
                  <div className="w-10 h-10 rounded-full bg-[var(--secondary)] flex items-center justify-center relative"><User className="w-5 h-5 text-[var(--foreground)]" /><div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[var(--card)]" /></div>
                  <div className="w-10 h-10 rounded-full bg-[var(--secondary)] flex items-center justify-center relative"><User className="w-5 h-5 text-[var(--foreground)]" /><div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[var(--card)]" /></div>
                  <div className="w-10 h-10 rounded-full bg-[var(--secondary)] flex items-center justify-center"><Loader className="w-5 h-5 animate-spin text-[var(--foreground)]" /></div>
                </div>
                <div className="bg-[var(--foreground)] text-[var(--background)] text-center py-3 rounded-xl font-semibold">Sign Transaction</div>
              </div>
            </div>

            {/* Visual 1: Reputation */}
            <div className={`landing-visual-card ${secTab === 1 ? 'active' : ''}`}>
              <div className="landing-vs-score">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#FFB000] to-green-500" />
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-full bg-[var(--secondary)] flex items-center justify-center text-xl font-bold text-[var(--foreground)]">N</div>
                  <div className="text-left">
                    <div className="font-bold text-[var(--foreground)] text-base">nadya.id</div>
                    <span className="text-[11px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full font-bold">Verified Human</span>
                  </div>
                </div>
                <div className="relative w-[140px] h-[140px] mx-auto mb-6 flex items-center justify-center flex-col">
                  <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#f0f0f0" strokeWidth="8" />
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#00C853" strokeWidth="8" strokeLinecap="round" strokeDasharray="283" strokeDashoffset="20" />
                  </svg>
                  <div className="absolute text-center">
                    <div className="text-[42px] font-extrabold text-[var(--foreground)] leading-none">98</div>
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mt-1">Trust Score</div>
                  </div>
                </div>
                <div className="flex justify-center gap-3">
                  {[Wallet, Twitter, MessageCircle, History].map((Icon, i) => (
                    <div key={i} className="w-9 h-9 bg-[var(--muted)] rounded-[10px] flex items-center justify-center text-[var(--foreground)] relative">
                      <Icon className="w-4 h-4" />
                      <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-[var(--card)] rounded-full flex items-center justify-center">
                        <Check className="w-2 h-2 text-white" strokeWidth={4} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Visual 2: AI Guardian */}
            <div className={`landing-visual-card ${secTab === 2 ? 'active' : ''}`}>
              <div className="relative w-[280px] h-[280px] flex items-center justify-center">
                <div className="absolute w-full h-full border border-[rgba(255,176,0,0.3)] rounded-full animate-pulse" />
                <div className="absolute w-[70%] h-[70%] border border-[rgba(255,176,0,0.6)] rounded-full" />
                <ShieldCheck className="w-20 h-20 text-[#FFB000] z-10 drop-shadow-[0_0_20px_rgba(255,176,0,0.5)]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ SECTION ═══ */}
      <section className="landing-faq-section">
        <div className="max-w-[800px] mx-auto">
          <h2 className="landing-faq-title">Everything you need to know.</h2>
          {faqItems.map((item, i) => (
            <div key={i} className="landing-faq-item">
              <button
                className="landing-faq-question-btn"
                aria-expanded={openFaqIndex === i}
                onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}
              >
                <span>{item.q}</span>
                <div className={`landing-faq-toggle ${openFaqIndex === i ? 'open' : ''}`}>
                  <Plus className="w-4 h-4" />
                </div>
              </button>
              <div className={`landing-faq-answer ${openFaqIndex === i ? 'open' : ''}`}>
                {item.a}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="landing-footer">
        <div className="landing-footer-ray" />
        <canvas ref={canvasRef} className="landing-star-canvas" />
        <div className="landing-footer-deck">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center">
              <img src="/nexid_logo.png" alt="Safu" className="w-full h-full object-contain" />
            </div>
            <span className="font-extrabold text-white text-lg">NexID</span>
          </div>
          <div className="flex gap-8 flex-wrap justify-center">
            <a href="https://NexID.gitbook.io/NexID-docs/" target="_blank" rel="noopener noreferrer" className="landing-f-link">Docs</a>
            <span className="landing-f-link cursor-pointer" onClick={() => router.push('/api-docs')}>API</span>
            <span className="landing-f-link cursor-pointer" onClick={() => router.push('/pricing')}>Pricing</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex gap-4 items-center">
              <a href="https://twitter.com/NexID" target="_blank" rel="noopener noreferrer"><Twitter className="w-5 h-5 text-gray-500 hover:text-[#FFB000] transition-colors cursor-pointer" /></a>
            </div>
            <a href="https://discord.gg/NexID" target="_blank" rel="noopener noreferrer" className="bg-white text-black font-bold text-sm px-6 py-2.5 rounded-full hover:bg-[#FFB000] transition-all">Join Community</a>
          </div>
        </div>
      </footer>

      {/* Back to Top */}
      <div
        className={`landing-back-to-top ${backToTopVisible ? 'visible' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp className="w-6 h-6" />
      </div>
      <style jsx global>{`
        @keyframes landingNexidPan {
          from {
            background-position: 0 0;
          }
          to {
            background-position: -1000px 1000px;
          }
        }
      `}</style>
    </div>
  )
}
