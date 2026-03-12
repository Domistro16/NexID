import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { NexDomains } from '@nexid/sdk'
import { encodeFunctionData } from 'viem'
import { constants } from '@/constant'
import { AgentRegistrarControllerABI } from '@/lib/abi'

const CHAIN_ID = 8453 // Base mainnet

/**
 * POST /api/register/batch
 *
 * For AI agents to register multiple .id names in one transaction
 *
 * Request body:
 * {
 *   "names": ["bot-1", "bot-2", "bot-3"],
 *   "owner": "0x..."
 * }
 */
export async function POST(request: NextRequest) {
    const rl = rateLimit(request)
    if (!rl.ok) return rl.response!
    let body
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON body' },
            { status: 400 }
        )
    }

    const { names, owner } = body

    // Validate inputs
    if (!Array.isArray(names) || names.length === 0) {
        return NextResponse.json(
            { error: 'Missing or invalid "names" array' },
            { status: 400 }
        )
    }

    if (names.length > 50) {
        return NextResponse.json(
            { error: 'Maximum 50 names per batch' },
            { status: 400 }
        )
    }

    if (!owner || !owner.match(/^0x[a-fA-F0-9]{40}$/)) {
        return NextResponse.json(
            { error: 'Missing or invalid "owner" address' },
            { status: 400 }
        )
    }

    const sdk = new NexDomains({ chainId: CHAIN_ID })

    try {
        // Check availability and calculate prices
        let totalPriceWei = 0n
        const nameDetails: { name: string; priceWei: string; isAgentName: boolean }[] = []
        const unavailable: string[] = []

        for (const name of names) {
            const available = await sdk.available(name)

            if (!available) {
                unavailable.push(name)
                continue
            }

            const priceResult = await sdk.getPrice(name)
            totalPriceWei += priceResult.priceWei

            nameDetails.push({
                name,
                priceWei: priceResult.priceWei.toString(),
                isAgentName: priceResult.isAgentName,
            })
        }

        if (unavailable.length > 0) {
            return NextResponse.json({
                error: 'Some names are not available',
                unavailable,
                available: nameDetails,
            }, { status: 409 })
        }

        // Build batch registration requests (v2 - no duration)
        const requests = names.map(name => ({
            name,
            owner: owner as `0x${string}`,
            secret: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
            resolver: constants.PublicResolver,
            data: [] as `0x${string}`[],
            reverseRecord: false,
            ownerControlledFuses: 0,
            deployWallet: false,
            walletSalt: 0n,
        }))

        // Encode batch transaction
        const txData = encodeFunctionData({
            abi: AgentRegistrarControllerABI,
            functionName: 'batchRegister',
            args: [requests],
        })

        return NextResponse.json({
            success: true,
            count: names.length,
            names: nameDetails,
            transaction: {
                to: constants.Controller,
                data: txData,
                value: totalPriceWei.toString(),
                chainId: CHAIN_ID,
            },
            totalPrice: {
                wei: totalPriceWei.toString(),
                eth: (Number(totalPriceWei) / 1e18).toFixed(6),
            },
            instructions: 'Sign and broadcast the transaction with the specified value',
        })
    } catch (error: any) {
        console.error('Batch registration failed:', error)
        return NextResponse.json(
            { error: 'Batch registration failed', details: error.message },
            { status: 500 }
        )
    }
}
