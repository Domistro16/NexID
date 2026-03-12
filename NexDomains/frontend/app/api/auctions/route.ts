import { NextRequest, NextResponse } from 'next/server'

// Mock data for development - replace with contract reads
const mockAuctions = [
    {
        id: 1,
        name: 'trader',
        reservePrice: '10000000000000000000', // 10 ETH
        startTime: Math.floor(Date.now() / 1000) - 86400, // Started 1 day ago
        endTime: Math.floor(Date.now() / 1000) + 86400 * 2, // Ends in 2 days
        highestBid: '12500000000000000000', // 12.5 ETH
        highestBidder: '0x1234567890abcdef1234567890abcdef12345678',
        settled: false,
        isUSDC: false,
    },
    {
        id: 2,
        name: 'defi',
        reservePrice: '5000000000000000000', // 5 ETH
        startTime: Math.floor(Date.now() / 1000) - 172800, // Started 2 days ago
        endTime: Math.floor(Date.now() / 1000) + 3600, // Ends in 1 hour
        highestBid: '7000000000000000000', // 7 ETH
        highestBidder: '0xabcdef1234567890abcdef1234567890abcdef12',
        settled: false,
        isUSDC: false,
    },
    {
        id: 3,
        name: 'alpha',
        reservePrice: '3000000000000000000', // 3 ETH
        startTime: Math.floor(Date.now() / 1000) - 259200, // Started 3 days ago
        endTime: Math.floor(Date.now() / 1000) - 3600, // Ended 1 hour ago
        highestBid: '4500000000000000000', // 4.5 ETH
        highestBidder: '0x9876543210fedcba9876543210fedcba98765432',
        settled: false,
        isUSDC: false,
    },
    {
        id: 4,
        name: 'agent',
        reservePrice: '2000000000000000000', // 2 ETH
        startTime: Math.floor(Date.now() / 1000) - 604800, // Started 7 days ago
        endTime: Math.floor(Date.now() / 1000) - 86400, // Ended 1 day ago
        highestBid: '3000000000000000000', // 3 ETH
        highestBidder: '0xfedcba9876543210fedcba9876543210fedcba98',
        settled: true,
        isUSDC: false,
    },
]

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || 'active'
    const id = searchParams.get('id')

    // Single auction lookup
    if (id) {
        const auction = mockAuctions.find((a) => a.id === Number(id))
        if (!auction) {
            return NextResponse.json({ error: 'Auction not found' }, { status: 404 })
        }
        return NextResponse.json({ auction })
    }

    // Filter by status
    const now = Math.floor(Date.now() / 1000)
    let filtered = mockAuctions

    if (status === 'active') {
        filtered = mockAuctions.filter((a) => !a.settled && now < a.endTime)
    } else if (status === 'ended') {
        filtered = mockAuctions.filter((a) => !a.settled && now >= a.endTime)
    }

    // Add status field
    const auctions = filtered.map((a) => ({
        ...a,
        status: a.settled ? 'settled' : now < a.endTime ? 'active' : 'ended',
    }))

    return NextResponse.json({ auctions })
}
