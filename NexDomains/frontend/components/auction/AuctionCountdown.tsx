'use client'

import { useState, useEffect } from 'react'

interface AuctionCountdownProps {
    endTime: number
    className?: string
    isDark?: boolean
}

export function AuctionCountdown({ endTime, className, isDark = false }: AuctionCountdownProps) {
    const [timeLeft, setTimeLeft] = useState({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isEnded: false,
    })

    useEffect(() => {
        const updateTime = () => {
            const now = Math.floor(Date.now() / 1000)
            const remaining = endTime - now

            if (remaining <= 0) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true })
            } else {
                setTimeLeft({
                    days: Math.floor(remaining / 86400),
                    hours: Math.floor((remaining % 86400) / 3600),
                    minutes: Math.floor((remaining % 3600) / 60),
                    seconds: remaining % 60,
                    isEnded: false,
                })
            }
        }

        updateTime()
        const interval = setInterval(updateTime, 1000)
        return () => clearInterval(interval)
    }, [endTime])

    if (timeLeft.isEnded) {
        return (
            <div className={`text-font-bold font-mono text-red-500 ${className}`}>
                Auction Ended
            </div>
        )
    }

    return (
        <div className={`flex gap-3 ${className}`}>
            <TimeUnit value={timeLeft.days} label="Days" isDark={isDark} />
            <TimeUnit value={timeLeft.hours} label="Hours" isDark={isDark} />
            <TimeUnit value={timeLeft.minutes} label="Mins" isDark={isDark} />
            <TimeUnit value={timeLeft.seconds} label="Secs" highlight isDark={isDark} />
        </div>
    )
}

function TimeUnit({ value, label, highlight, isDark }: { value: number; label: string; highlight?: boolean; isDark: boolean }) {
    return (
        <div className="text-center">
            <div className={`text-3xl font-bold font-mono px-3 py-2 rounded-lg transition-colors border`}
                style={{
                    background: highlight
                        ? (isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)')
                        : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0,0,0,0.04)'),
                    color: highlight
                        ? '#22c55e'
                        : (isDark ? '#fff' : '#111'),
                    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'transparent'
                }}
            >
                {value.toString().padStart(2, '0')}
            </div>
            <div className="text-xs mt-1 uppercase tracking-wider font-semibold" style={{ color: isDark ? '#888' : '#888' }}>{label}</div>
        </div>
    )
}
