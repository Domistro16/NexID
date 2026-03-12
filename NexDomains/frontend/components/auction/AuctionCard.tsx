'use client'

import { useState, useEffect } from 'react'
import { formatEther } from 'viem'
import Link from 'next/link'

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

export function AuctionCard({ auction, isDark }: { auction: Auction, isDark: boolean }) {
    const [timeLeft, setTimeLeft] = useState('')

    useEffect(() => {
        const updateTime = () => {
            const now = Math.floor(Date.now() / 1000)
            const remaining = auction.endTime - now

            if (remaining <= 0) {
                setTimeLeft('Ended')
            } else {
                const days = Math.floor(remaining / 86400)
                const hours = Math.floor((remaining % 86400) / 3600)
                const minutes = Math.floor((remaining % 3600) / 60)
                const seconds = remaining % 60

                if (days > 0) {
                    setTimeLeft(`${days}d ${hours}h`)
                } else if (hours > 0) {
                    setTimeLeft(`${hours}h ${minutes}m`)
                } else {
                    setTimeLeft(`${minutes}m ${seconds}s`)
                }
            }
        }

        updateTime()
        const interval = setInterval(updateTime, 1000)
        return () => clearInterval(interval)
    }, [auction.endTime])

    const isEnded = Date.now() / 1000 >= auction.endTime
    const hasNoBids = auction.highestBid === '0'
    const currency = auction.isUSDC ? 'USDC' : 'ETH'

    return (
        <Link href={`/auctions/${auction.id}`}>
            <div
                className={`page-card h-full transition-transform hover:-translate-y-2 cursor-pointer flex flex-col`}
                style={{
                    background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.92)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0,0,0,0.06)'
                }}
            >
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-2xl font-bold mb-1" style={{ color: isDark ? '#fff' : '#111' }}>
                            {auction.name}.id
                        </h3>
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#f59e0b]">
                            <span>🏆</span> Premium
                        </span>
                    </div>
                    <div className="text-right">
                        <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: isDark ? '#888' : '#888' }}>Time Left</div>
                        <div className={`text-lg font-mono font-bold ${isEnded ? 'text-red-500' : 'text-green-500'}`}>
                            {timeLeft}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-4 rounded-2xl" style={{ background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)' }}>
                        <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: isDark ? '#888' : '#888' }}>Reserve</div>
                        <div className="text-lg font-bold" style={{ color: isDark ? '#fff' : '#111' }}>
                            {formatEther(BigInt(auction.reservePrice))} {currency}
                        </div>
                    </div>
                    <div className="p-4 rounded-2xl" style={{ background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)' }}>
                        <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: isDark ? '#888' : '#888' }}>Current Bid</div>
                        <div className={`text-lg font-bold ${hasNoBids ? 'opacity-50' : 'text-green-500'}`} style={{ color: hasNoBids ? (isDark ? '#fff' : '#111') : undefined }}>
                            {hasNoBids ? '—' : `${formatEther(BigInt(auction.highestBid))} ${currency}`}
                        </div>
                    </div>
                </div>

                <div className="mt-auto">
                    {!isEnded && (
                        <button className="w-full btn-primary">
                            Place Bid
                        </button>
                    )}

                    {isEnded && !auction.settled && (
                        <button className="w-full py-3 bg-green-600 text-white font-bold rounded-[40px] hover:bg-green-500 transition-all shadow-lg hover:shadow-green-500/20">
                            Settle Auction
                        </button>
                    )}

                    {auction.settled && (
                        <div className="w-full py-3 bg-gray-500/20 text-gray-500 font-bold rounded-[40px] text-center border border-gray-500/20">
                            Settled
                        </div>
                    )}
                </div>
            </div>
        </Link>
    )
}
