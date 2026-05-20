import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { NexDomains } from '@nexid/sdk'
import { createPublicClient, encodeFunctionData, http, namehash, keccak256, toBytes, zeroAddress } from 'viem'
import { base } from 'viem/chains'
import { constants } from '@/constant'
import { AgentPublicResolverABI, AgentRegistrarControllerABI, AgentRegistrarControllerV2ABI } from '@/lib/abi'
import { normalizeDomainLabel } from '@/utils/domainUtils'
import {
    buildIdentityNotificationProfile,
    mergeIdentityNotificationTextRecords,
} from '@/lib/identity-notifications'

const CHAIN_ID = 8453 // Base mainnet

const publicClient = createPublicClient({
    chain: base,
    transport: http(),
})

const reservedOwnersAbi = [
    {
        inputs: [{ name: '', type: 'bytes32' }],
        name: 'reservedOwners',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const

// Resolver ABI for setAddr and setText
const ResolverABI = [
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'addr', type: 'address' },
        ],
        name: 'setAddr',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'key', type: 'string' },
            { name: 'value', type: 'string' },
        ],
        name: 'setText',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const

/**
 * POST /api/register
 *
 * For AI agents to register .id names
 *
 * Request body:
 * {
 *   "name": "my-trading-bot",
 *   "owner": "0x...",
 *   "reverseRecord": true,
 *   "textRecords": { "description": "My AI agent", "url": "https://..." }
 * }
 *
 * Returns transaction data that agent must sign and broadcast
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
        owner,
        reverseRecord = false,
        textRecords = {},
        notificationProfile,
    } = body

    // Validate inputs
    if (!name || typeof name !== 'string') {
        return NextResponse.json(
            { error: 'Missing or invalid "name" field' },
            { status: 400 }
        )
    }
    const normalizedName = normalizeDomainLabel(name)
    if (!normalizedName) {
        return NextResponse.json(
            { error: 'Invalid "name" field' },
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
        const reservedOwner = await publicClient.readContract({
            address: constants.Controller,
            abi: reservedOwnersAbi,
            functionName: 'reservedOwners',
            args: [keccak256(toBytes(normalizedName))],
        })
        if (reservedOwner && reservedOwner !== zeroAddress) {
            return NextResponse.json(
                { error: 'Name is reserved', name: normalizedName },
                { status: 409 }
            )
        }

        // Check availability
        const available = await sdk.available(normalizedName)

        if (!available) {
            return NextResponse.json(
                { error: 'Name is not available', name: normalizedName, available: false },
                { status: 409 }
            )
        }

        // Get price
        const priceResult = await sdk.getPrice(normalizedName)
        const [agentModeEnabled, skipCommitForNonAgents] = await Promise.all([
            publicClient.readContract({
                address: constants.Controller,
                abi: AgentRegistrarControllerV2ABI,
                functionName: 'agentModeEnabled',
            }),
            publicClient.readContract({
                address: constants.Controller,
                abi: AgentRegistrarControllerV2ABI,
                functionName: 'skipCommitForNonAgents',
            }),
        ]) as [boolean, boolean]
        const requiresCommit = priceResult.isAgentName ? !agentModeEnabled : !skipCommitForNonAgents
        if (requiresCommit) {
            return NextResponse.json(
                { error: 'Commit-reveal is currently required for this name type', name: normalizedName },
                { status: 409 }
            )
        }

        const identityNotificationProfile = notificationProfile
            ? buildIdentityNotificationProfile({
                name: normalizedName,
                owner,
                profile: notificationProfile,
                academyBaseUrl: process.env.NEXACADEMY_API_BASE_URL,
            })
            : null
        const effectiveTextRecords = identityNotificationProfile
            ? mergeIdentityNotificationTextRecords(
                textRecords,
                identityNotificationProfile.resolverTextRecords,
            )
            : textRecords

        // Build resolver data
        const node = namehash(`${normalizedName}.id`)
        const data: `0x${string}`[] = []

        // Set owner address record
        data.push(encodeFunctionData({
            abi: ResolverABI,
            functionName: 'setAddr',
            args: [node, owner as `0x${string}`],
        }))

        // Set text records
        for (const [key, value] of Object.entries(effectiveTextRecords)) {
            if (key && value && typeof value === 'string') {
                data.push(encodeFunctionData({
                    abi: ResolverABI,
                    functionName: 'setText',
                    args: [node, key, value],
                }))
            }
        }

        // Build registration request (v2 - no duration)
        const registerRequest = {
            name: normalizedName,
            owner: owner as `0x${string}`,
            secret: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
            resolver: constants.PublicResolver,
            data,
            reverseRecord,
            ownerControlledFuses: 0,
            deployWallet: false,
            walletSalt: 0n,
        }

        // Empty referral
        const referralData = {
            referrer: '0x0000000000000000000000000000000000000000' as `0x${string}`,
            registrant: '0x0000000000000000000000000000000000000000' as `0x${string}`,
            nameHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
            referrerCodeHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
            deadline: 0n,
            nonce: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
        }

        // Encode the transaction
        const txData = encodeFunctionData({
            abi: AgentRegistrarControllerABI,
            functionName: 'register',
            args: [registerRequest, referralData, '0x'],
        })

        // Return transaction data for agent to sign
        return NextResponse.json({
            success: true,
            name: normalizedName,
            fullName: `${normalizedName}.id`,
            isAgentName: priceResult.isAgentName,
            transaction: {
                to: constants.Controller,
                data: txData,
                value: priceResult.priceWei.toString(),
                chainId: CHAIN_ID,
            },
            price: {
                wei: priceResult.priceWei.toString(),
                eth: (Number(priceResult.priceWei) / 1e18).toFixed(6),
                usd: Number(priceResult.priceUsd) / 1e18,
            },
            identityNotificationProfile,
            instructions: 'Sign and broadcast the transaction with the specified value',
        })
    } catch (error: any) {
        console.error('Registration failed:', error)
        return NextResponse.json(
            { error: 'Registration failed', details: error.message },
            { status: 500 }
        )
    }
}
