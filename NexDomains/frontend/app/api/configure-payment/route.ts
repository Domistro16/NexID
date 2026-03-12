import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { encodeFunctionData, namehash } from 'viem'
import { constants } from '@/constant'
import { AgentPublicResolverABI } from '@/lib/abi'

const CHAIN_ID = 8453 // Base mainnet

// Extended resolver ABI for payment configuration
const PaymentResolverABI = [
    ...AgentPublicResolverABI,
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'chains', type: 'uint256[]' },
        ],
        name: 'setSupportedChains',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const

/**
 * POST /api/configure-payment
 *
 * For agents to configure their x402/ERC-8004 payment profile
 *
 * Request body:
 * {
 *   "name": "my-agent",
 *   "x402Endpoint": "https://api.myagent.com/x402",
 *   "agentMetadata": "ipfs://...",
 *   "paymentEnabled": true,
 *   "paymentAddress": "0x...",
 *   "supportedChains": [8453, 1]
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

    const {
        name,
        x402Endpoint,
        agentMetadata,
        paymentEnabled,
        paymentAddress,
        supportedChains,
    } = body

    if (!name) {
        return NextResponse.json(
            { error: 'Missing "name" field' },
            { status: 400 }
        )
    }

    const node = namehash(`${name}.id`)
    const transactions: {
        description: string
        to: `0x${string}`
        data: `0x${string}`
        value: string
    }[] = []

    try {
        // Build transaction for each setting
        if (x402Endpoint !== undefined) {
            transactions.push({
                description: 'Set x402 endpoint',
                to: constants.PublicResolver,
                data: encodeFunctionData({
                    abi: AgentPublicResolverABI,
                    functionName: 'setX402Endpoint',
                    args: [node, x402Endpoint],
                }),
                value: '0',
            })
        }

        if (agentMetadata !== undefined) {
            transactions.push({
                description: 'Set agent metadata',
                to: constants.PublicResolver,
                data: encodeFunctionData({
                    abi: AgentPublicResolverABI,
                    functionName: 'setAgentMetadata',
                    args: [node, agentMetadata],
                }),
                value: '0',
            })
        }

        if (paymentEnabled !== undefined) {
            transactions.push({
                description: 'Set payment enabled',
                to: constants.PublicResolver,
                data: encodeFunctionData({
                    abi: AgentPublicResolverABI,
                    functionName: 'setPaymentEnabled',
                    args: [node, paymentEnabled],
                }),
                value: '0',
            })
        }

        if (paymentAddress && supportedChains && Array.isArray(supportedChains)) {
            // Set payment address for each supported chain
            for (const chainId of supportedChains) {
                transactions.push({
                    description: `Set payment address for chain ${chainId}`,
                    to: constants.PublicResolver,
                    data: encodeFunctionData({
                        abi: AgentPublicResolverABI,
                        functionName: 'setPaymentAddress',
                        args: [node, BigInt(chainId), paymentAddress as `0x${string}`],
                    }),
                    value: '0',
                })
            }

            // Set supported chains list
            transactions.push({
                description: 'Set supported chains',
                to: constants.PublicResolver,
                data: encodeFunctionData({
                    abi: PaymentResolverABI,
                    functionName: 'setSupportedChains',
                    args: [node, supportedChains.map(BigInt)],
                }),
                value: '0',
            })
        }

        if (transactions.length === 0) {
            return NextResponse.json(
                { error: 'No configuration options provided' },
                { status: 400 }
            )
        }

        return NextResponse.json({
            success: true,
            name,
            fullName: `${name}.id`,
            transactions,
            chainId: CHAIN_ID,
            instructions: 'Sign and broadcast each transaction in order (or use multicall)',
        })
    } catch (error: any) {
        console.error('Configuration failed:', error)
        return NextResponse.json(
            { error: 'Configuration failed', details: error.message },
            { status: 500 }
        )
    }
}
