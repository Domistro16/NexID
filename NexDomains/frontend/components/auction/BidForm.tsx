'use client'

import { useState } from 'react'
import { parseEther, formatEther } from 'viem'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'

interface BidFormProps {
    auctionId: number
    minBid: bigint
    isUSDC: boolean
    isDark?: boolean
}

export function BidForm({ auctionId, minBid, isUSDC, isDark = false }: BidFormProps) {
    const { address, isConnected } = useAccount()
    const [bidAmount, setBidAmount] = useState('')

    const { writeContract, data: hash, isPending } = useWriteContract()
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

    const currency = isUSDC ? 'USDC' : 'ETH'
    const minBidFormatted = formatEther(minBid)

    // Quick bid multipliers
    const quickBids = [1, 1.1, 1.25, 1.5].map((m) => ({
        multiplier: m,
        amount: (minBid * BigInt(Math.floor(m * 100))) / 100n,
        label: m === 1 ? 'Min' : `+${((m - 1) * 100).toFixed(0)}%`,
    }))

    const handleBid = () => {
        if (!bidAmount || !isConnected) return

        const amount = parseEther(bidAmount)

        // TODO: Add actual contract call
        console.log('Placing bid:', { auctionId, amount: amount.toString(), isUSDC })
    }

    const isValidBid = bidAmount && parseEther(bidAmount || '0') >= minBid

    return (
        <div className="space-y-6">
            <div>
                <label className="block text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: isDark ? '#aaa' : '#666' }}>
                    Your Bid (Min: {minBidFormatted} {currency})
                </label>
                <div className="flex gap-4">
                    <div className="relative flex-1">
                        <input
                            type="number"
                            value={bidAmount}
                            onChange={(e) => setBidAmount(e.target.value)}
                            placeholder={minBidFormatted}
                            className={`input-field`}
                            style={{
                                background: isDark ? 'rgba(0,0,0,0.2)' : '#f9f9f9',
                                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                                color: isDark ? '#fff' : '#111'
                            }}
                            step="0.01"
                            min={Number(minBidFormatted)}
                        />
                        <span className="absolute right-5 top-1/2 -translate-y-1/2 font-semibold" style={{ color: isDark ? '#888' : '#888' }}>
                            {currency}
                        </span>
                    </div>
                    <button
                        onClick={handleBid}
                        disabled={!isConnected || isPending || isConfirming || !isValidBid}
                        className={`btn-primary whitespace-nowrap px-8 ${!isConnected || !isValidBid ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isPending || isConfirming ? (
                            <span className="flex items-center gap-2">
                                <span className="animate-spin">⏳</span> Bidding...
                            </span>
                        ) : (
                            'Place Bid'
                        )}
                    </button>
                </div>
            </div>

            {/* Quick bid buttons */}
            <div className="grid grid-cols-4 gap-3">
                {quickBids.map(({ multiplier, amount, label }) => (
                    <button
                        key={multiplier}
                        onClick={() => setBidAmount(formatEther(amount))}
                        className={`py-3 px-2 rounded-xl text-sm font-medium transition-all border`}
                        style={{
                            background: bidAmount === formatEther(amount)
                                ? '#f59e0b'
                                : (isDark ? 'rgba(255,255,255,0.05)' : '#fff'),
                            borderColor: bidAmount === formatEther(amount)
                                ? '#f59e0b'
                                : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'),
                            color: bidAmount === formatEther(amount)
                                ? '#000'
                                : (isDark ? '#fff' : '#111')
                        }}
                    >
                        <div className="text-xs mb-1 opacity-70">{label}</div>
                        <div className="font-bold">{formatEther(amount).slice(0, 6)}</div>
                    </button>
                ))}
            </div>

            {/* Wallet connection warning */}
            {!isConnected && (
                <div className="p-4 rounded-xl text-center text-sm font-semibold border bg-[#f59e0b]/10 border-[#f59e0b]/30 text-[#f59e0b]">
                    Connect your wallet to place a bid
                </div>
            )}

            {/* Success message */}
            {isSuccess && (
                <div className="p-4 rounded-xl text-center text-sm font-semibold border bg-green-500/10 border-green-500/30 text-green-500">
                    ✅ Bid placed successfully!
                </div>
            )}
        </div>
    )
}
