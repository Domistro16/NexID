'use client'

import { useState, useEffect } from 'react'
import { useChainId } from 'wagmi'
import { AuctionCard } from '@/components/auction/AuctionCard'

interface Auction {
    id: number
    name: string
    reservePrice: string
    startTime: number
    endTime: number
    highestBid: string
    highestBidder: string
    settled: boolean
    isUSDC: boolean
    status: 'active' | 'ended' | 'settled'
}

export default function AuctionsPage() {
    const [auctions, setAuctions] = useState<Auction[]>([])
    const [filter, setFilter] = useState<'active' | 'ended' | 'all'>('active')
    const [loading, setLoading] = useState(true)

    const chainId = useChainId()

    // Theme state for conditional rendering if needed
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
        const fetchAuctions = async () => {
            setLoading(true)
            try {
                // Determine status for API based on tab
                const statusParam = filter === 'all' ? '' : `status=${filter}`
                const chainParam = chainId ? `&chainId=${chainId}` : ''

                // Note: The actual API might need specific implementation to filter
                // For now assuming existing structure
                const res = await fetch(`/api/auctions?${statusParam}${chainParam}`)
                const data = await res.json()

                // Client-side filter if API returns all
                let filtered = data.auctions || []
                if (filter !== 'all') {
                    filtered = filtered.filter((a: Auction) =>
                        filter === 'active' ? (a.status === 'active') : (a.status === 'ended' || a.status === 'settled')
                    )
                }

                setAuctions(filtered)
            } catch (error) {
                console.error('Failed to fetch auctions:', error)
            }
            setLoading(false)
        }
        fetchAuctions()
    }, [filter, chainId])

    return (
        <div className="hero-section-wrapper min-h-screen">
            <div className="container mx-auto px-4 md:px-8 max-w-[1240px]">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1>
                        Premium <span>Auctions</span>
                    </h1>
                    <p className="hero-subtext">
                        Bid on exclusive, high-value .id domain names.
                    </p>
                </div>

                {/* Filter tabs */}
                <div className="flex justify-center gap-4 mb-12">
                    {(['active', 'ended', 'all'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`tab-button ${filter === f ? 'active' : ''}`}
                            style={{
                                color: filter === f ? (isDark ? '#fff' : '#111') : (isDark ? '#888' : '#666'),
                                borderColor: filter === f ? (isDark ? '#fff' : '#111') : 'transparent'
                            }}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Loading */}
                {loading && (
                    <div className="flex justify-center py-20">
                        {/* Simple Spinner */}
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: isDark ? '#fff' : '#111' }}></div>
                    </div>
                )}

                {/* Auction grid */}
                {!loading && auctions.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {auctions.map((auction) => (
                            <AuctionCard key={auction.id} auction={auction} isDark={isDark} />
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && auctions.length === 0 && (
                    <div className={`text-center py-20 rounded-3xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/5 bg-white/60'}`}>
                        <div className="text-6xl mb-6">🏆</div>
                        <h3 className="text-2xl font-bold mb-3" style={{ color: isDark ? '#fff' : '#111' }}>
                            No Auctions Found
                        </h3>
                        <p style={{ color: isDark ? '#aaa' : '#666' }}>
                            {filter === 'active'
                                ? 'No active auctions right now. Check back soon!'
                                : 'No auctions match this filter.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
