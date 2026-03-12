'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { formatEther } from 'viem'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import Link from 'next/link'
import { AuctionCountdown } from '@/components/auction/AuctionCountdown'
import { BidForm } from '@/components/auction/BidForm'

interface AuctionDetail {
    id: number
    name: string
    reservePrice: bigint
    startTime: number
    endTime: number
    highestBid: bigint
    highestBidder: string
    settled: boolean
    isUSDC: boolean
}

export default function AuctionDetailPage() {
    const { id } = useParams()
    const { address } = useAccount()
    const [auction, setAuction] = useState<AuctionDetail | null>(null)
    const [loading, setLoading] = useState(true)

    // Theme state
    const [theme, setTheme] = useState('light')
    useEffect(() => {
        const checkTheme = () => {
            const isDark = document.body.classList.contains('dark-mode')
            setTheme(isDark ? 'dark' : 'light')
        }
        checkTheme()
        const observer = new MutationObserver(checkTheme)
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
        return () => observer.disconnect()
    }, [])
    const isDark = theme === 'dark'

    useEffect(() => {
        const fetchAuction = async () => {
            try {
                const res = await fetch(`/api/auctions?id=${id}`)
                const data = await res.json()
                if (data.auction) {
                    setAuction({
                        ...data.auction,
                        reservePrice: BigInt(data.auction.reservePrice),
                        highestBid: BigInt(data.auction.highestBid),
                    })
                }
            } catch (error) {
                console.error('Failed to fetch auction:', error)
            }
            setLoading(false)
        }
        if (id) fetchAuction()
    }, [id])

    if (loading) {
        return (
            <div className="hero-section-wrapper min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: isDark ? '#fff' : '#111' }}></div>
            </div>
        )
    }

    if (!auction) {
        return (
            <div className="hero-section-wrapper min-h-screen flex flex-col items-center justify-center">
                <div className="text-6xl mb-6">🔍</div>
                <h2 className="text-2xl font-bold mb-4" style={{ color: isDark ? '#fff' : '#111' }}>Auction Not Found</h2>
                <Link href="/auctions" className="text-[#f59e0b] hover:opacity-80 font-bold">
                    ← Back to Auctions
                </Link>
            </div>
        )
    }

    const isEnded = Date.now() / 1000 >= auction.endTime
    const isLeading = address && auction.highestBidder.toLowerCase() === address.toLowerCase()
    const currency = auction.isUSDC ? 'USDC' : 'ETH'

    return (
        <div className="hero-section-wrapper min-h-screen">
            <div className="container mx-auto px-4 md:px-8 max-w-[1240px]">
                {/* Breadcrumb */}
                <div className="mb-8">
                    <Link
                        href="/auctions"
                        className="font-medium transition-opacity hover:opacity-70"
                        style={{ color: isDark ? '#aaa' : '#666' }}
                    >
                        ← Back to Auctions
                    </Link>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-20">
                    {/* Left: Auction info */}
                    <div>
                        <div className="mb-6">
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#f59e0b]/20 text-[#f59e0b] rounded-full text-sm font-bold">
                                <span>🏆</span> Premium Auction
                            </span>
                        </div>

                        <h1 className="mb-8" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', lineHeight: 1.1 }}>
                            {auction.name}.id
                        </h1>

                        <div className={`page-card`} style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.92)',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0,0,0,0.06)'
                        }}>
                            {/* Countdown */}
                            <div className="mb-8 p-6 rounded-2xl border" style={{
                                background: isDark ? 'rgba(0,0,0,0.3)' : '#f8f8f7',
                                borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
                            }}>
                                <div className="text-sm uppercase tracking-wider font-bold mb-2" style={{ color: isDark ? '#888' : '#888' }}>
                                    {isEnded ? 'Auction Ended' : 'Time Remaining'}
                                </div>
                                <div style={{ color: isDark ? '#fff' : '#111' }}>
                                    <AuctionCountdown endTime={auction.endTime} className="text-3xl md:text-4xl font-mono font-bold" />
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="p-4 rounded-2xl" style={{ background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)' }}>
                                    <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: isDark ? '#888' : '#888' }}>Reserve Price</div>
                                    <div className="text-2xl font-bold" style={{ color: isDark ? '#fff' : '#111' }}>
                                        {formatEther(auction.reservePrice)} {currency}
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl" style={{ background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)' }}>
                                    <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: isDark ? '#888' : '#888' }}>Current Bid</div>
                                    <div className={`text-2xl font-bold ${auction.highestBid === 0n ? 'opacity-50' : 'text-green-500'}`} style={{ color: auction.highestBid === 0n ? (isDark ? '#fff' : '#111') : undefined }}>
                                        {auction.highestBid === 0n
                                            ? 'No bids yet'
                                            : `${formatEther(auction.highestBid)} ${currency}`}
                                    </div>
                                </div>
                            </div>

                            {/* Leading bidder */}
                            {auction.highestBidder !== '0x0000000000000000000000000000000000000000' && (
                                <div className="p-5 rounded-2xl mb-8 border" style={{
                                    background: isLeading ? 'rgba(34, 197, 94, 0.1)' : (isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)'),
                                    borderColor: isLeading ? 'rgba(34, 197, 94, 0.2)' : 'transparent'
                                }}>
                                    <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: isDark ? '#888' : '#888' }}>Leading Bidder</div>
                                    <div className={`font-mono text-lg ${isLeading ? 'text-green-500 font-bold' : ''}`} style={{ color: !isLeading ? (isDark ? '#fff' : '#111') : undefined }}>
                                        {isLeading ? (
                                            <span className="flex items-center gap-2">
                                                <span>👑</span> You are winning!
                                            </span>
                                        ) : (
                                            `${auction.highestBidder.slice(0, 6)}...${auction.highestBidder.slice(-4)}`
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Bid form */}
                            {!isEnded && !auction.settled && (
                                <div className="mt-4">
                                    <BidForm
                                        auctionId={auction.id}
                                        minBid={auction.highestBid === 0n
                                            ? auction.reservePrice
                                            : auction.highestBid + (auction.highestBid * 5n / 100n)}
                                        isUSDC={auction.isUSDC}
                                        isDark={isDark}
                                    />
                                </div>
                            )}

                            {/* Settle button */}
                            {isEnded && !auction.settled && auction.highestBid > 0n && (
                                <SettleButton auctionId={auction.id} />
                            )}

                            {/* Settled state */}
                            {auction.settled && (
                                <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-2xl text-center">
                                    <div className="text-green-500 font-bold text-xl mb-1">✅ Auction Settled</div>
                                    <div className="text-sm opacity-80" style={{ color: isDark ? '#fff' : '#111' }}>
                                        Winner: {auction.highestBidder.slice(0, 6)}...{auction.highestBidder.slice(-4)}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Info panel */}
                    <div className="space-y-6 pt-0 lg:pt-24">
                        {/* Auction info */}
                        <div className="page-card" style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.92)',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0,0,0,0.06)'
                        }}>
                            <h3 className="text-xl font-bold mb-6" style={{ color: isDark ? '#fff' : '#111' }}>Auction Details</h3>
                            <div className="space-y-4 text-sm font-medium">
                                <div className="flex justify-between py-2 border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
                                    <span style={{ color: isDark ? '#888' : '#666' }}>Auction ID</span>
                                    <span className="font-mono" style={{ color: isDark ? '#fff' : '#111' }}>#{auction.id}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
                                    <span style={{ color: isDark ? '#888' : '#666' }}>Started</span>
                                    <span style={{ color: isDark ? '#fff' : '#111' }}>{new Date(auction.startTime * 1000).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
                                    <span style={{ color: isDark ? '#888' : '#666' }}>Ends</span>
                                    <span style={{ color: isDark ? '#fff' : '#111' }}>{new Date(auction.endTime * 1000).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
                                    <span style={{ color: isDark ? '#888' : '#666' }}>Currency</span>
                                    <span style={{ color: isDark ? '#fff' : '#111' }}>{currency}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
                                    <span style={{ color: isDark ? '#888' : '#666' }}>Min Increment</span>
                                    <span style={{ color: isDark ? '#fff' : '#111' }}>5%</span>
                                </div>
                            </div>
                        </div>

                        {/* How it works */}
                        <div className="page-card" style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.92)',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0,0,0,0.06)'
                        }}>
                            <h3 className="text-xl font-bold mb-6" style={{ color: isDark ? '#fff' : '#111' }}>How It Works</h3>
                            <div className="space-y-4" style={{ color: isDark ? '#aaa' : '#666' }}>
                                <div className="flex gap-4 items-start">
                                    <div className="w-6 h-6 rounded-full bg-[#f59e0b] text-black font-bold flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</div>
                                    <span>Place a bid at or above the minimum amount</span>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <div className="w-6 h-6 rounded-full bg-[#f59e0b] text-black font-bold flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</div>
                                    <span>Outbid others or get refunded automatically</span>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <div className="w-6 h-6 rounded-full bg-[#f59e0b] text-black font-bold flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</div>
                                    <span>Last 10 min bids extend the auction (anti-sniping)</span>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <div className="w-6 h-6 rounded-full bg-[#f59e0b] text-black font-bold flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</div>
                                    <span>Winner claims the domain after settlement</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function SettleButton({ auctionId }: { auctionId: number }) {
    const { writeContract, data: hash, isPending } = useWriteContract()
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

    const handleSettle = () => {
        // TODO: Add actual contract call
        console.log('Settling auction:', auctionId)
    }

    return (
        <button
            onClick={handleSettle}
            disabled={isPending || isConfirming}
            className="w-full py-4 text-white font-bold rounded-[40px] transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            style={{
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
            }}
        >
            {isPending || isConfirming ? 'Settling...' : 'Settle Auction'}
        </button>
    )
}
