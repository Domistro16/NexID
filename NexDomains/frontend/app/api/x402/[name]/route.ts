import { NextRequest, NextResponse } from 'next/server'
import { NexDomains } from '@nexid/sdk'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

const CHAIN_ID = 8453 // Base mainnet

// GET: Get payment profile for a name
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const rl = rateLimit(request)
    if (!rl.ok) return rl.response!

    const { name } = await params
    const cleanName = name.replace('.id', '')

    const sdk = new NexDomains({ chainId: CHAIN_ID })

    try {
        const profile = await sdk.getPaymentProfile(cleanName, CHAIN_ID)

        // Return x402 compatible response regardless of enabled status for dashboard visibility
        // Clients should check paymentEnabled flag

        // Return x402 compatible response
        return NextResponse.json({
            name: `${cleanName}.id`,
            paymentAddress: profile.paymentAddress,
            supportedChains: profile.supportedChains,
            x402Endpoint: profile.x402Endpoint,
            paymentEnabled: profile.paymentEnabled,
            agentMetadata: profile.agentMetadata,
        })
    } catch (error) {
        console.error('Failed to resolve payment profile:', error)
        return NextResponse.json(
            { error: 'Failed to resolve payment profile' },
            { status: 500 }
        )
    }
}

// POST: x402 payment negotiation
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const rl = rateLimit(request)
    if (!rl.ok) return rl.response!

    const { name } = await params
    const cleanName = name.replace('.id', '')

    let body
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON body' },
            { status: 400 }
        )
    }

    const { amount, token, chainId } = body
    const targetChainId = chainId || CHAIN_ID

    const sdk = new NexDomains({ chainId: CHAIN_ID })

    try {
        const profile = await sdk.getPaymentProfile(cleanName, targetChainId)

        if (!profile.paymentEnabled) {
            return NextResponse.json(
                {
                    error: 'Payments not enabled',
                    name: `${cleanName}.id`,
                },
                {
                    status: 402,
                    headers: { 'X-Payment-Required': 'true' }
                }
            )
        }

        // Return payment instructions
        return NextResponse.json({
            payTo: profile.paymentAddress,
            amount: amount || '0',
            token: token || '0x0000000000000000000000000000000000000000', // Native ETH
            chainId: targetChainId,
            invoice: `id-${cleanName}-${Date.now()}`,
            x402Endpoint: profile.x402Endpoint,
        })
    } catch (error) {
        console.error('Payment negotiation failed:', error)
        return NextResponse.json(
            { error: 'Payment negotiation failed' },
            { status: 500 }
        )
    }
}
