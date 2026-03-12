import { NextRequest, NextResponse } from 'next/server'
import { NexDomains } from '@nexid/sdk'
import { rateLimit } from '@/lib/rateLimit'

const CHAIN_ID = 8453 // Base mainnet

function formatUsd(wei: bigint): string {
    const usd = Number(wei) / 1e18
    return usd < 1 ? `$${usd.toFixed(2)}` : `$${usd.toLocaleString()}`
}

export async function GET(request: NextRequest) {
    const rl = rateLimit(request)
    if (!rl.ok) return rl.response!

    const name = request.nextUrl.searchParams.get('name')

    if (!name) {
        return NextResponse.json(
            { error: 'Name parameter required' },
            { status: 400 }
        )
    }

    const sdk = new NexDomains({ chainId: CHAIN_ID })

    try {
        const [price, available] = await Promise.all([
            sdk.getPrice(name),
            sdk.available(name),
        ])

        return NextResponse.json({
            name,
            available,
            priceWei: price.priceWei.toString(),
            priceUsd: price.priceUsd.toString(),
            priceUsdFormatted: formatUsd(price.priceUsd),
            priceEthFormatted: (Number(price.priceWei) / 1e18).toFixed(6),
            isAgentName: price.isAgentName,
        })
    } catch (error) {
        console.error('Failed to get price:', error)
        return NextResponse.json(
            { error: 'Failed to get price' },
            { status: 500 }
        )
    }
}
