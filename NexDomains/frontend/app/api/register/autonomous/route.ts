import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { createPublicClient, http, decodeFunctionData } from 'viem'
import { base } from 'viem/chains'
import { constants } from '@/constant'
import { AgentRegistrarControllerV2ABI } from '@/lib/abi'

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
})

const BUNDLER_URL = process.env.PIMLICO_BUNDLER_URL

/**
 * POST /api/register/autonomous
 *
 * For fully autonomous agents with their own AA wallet + USDC
 *
 * The agent submits a complete signed UserOp.
 * This API validates and forwards to the bundler.
 *
 * Request body:
 * {
 *   "userOp": {
 *     "sender": "0x...",
 *     "nonce": "0x...",
 *     "callData": "0x...",
 *     ... other UserOp fields
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  const rl = rateLimit(request)
  if (!rl.ok) return rl.response!
  try {
    if (!BUNDLER_URL) {
      return NextResponse.json(
        { error: 'Missing PIMLICO_BUNDLER_URL environment variable' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { userOp } = body

    if (!userOp || !userOp.sender || !userOp.signature) {
      return NextResponse.json(
        { error: 'Missing or incomplete UserOperation' },
        { status: 400 }
      )
    }

    // Validate the UserOp calls our contract
    // (Security: prevent arbitrary calls)
    const isValidTarget = await validateUserOpTarget(userOp)
    if (!isValidTarget) {
      return NextResponse.json(
        { error: 'UserOp must target NexID registrar' },
        { status: 403 }
      )
    }

    // Submit to bundler
    const response = await fetch(BUNDLER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendUserOperation',
        params: [userOp, constants.EntryPoint],
      }),
    })

    const data = await response.json()

    if (data.error) {
      return NextResponse.json(
        { error: 'Bundler rejected UserOp', details: data.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      userOpHash: data.result,
      message: 'UserOperation submitted to bundler',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Submission failed', details: error.message },
      { status: 500 }
    )
  }
}

async function validateUserOpTarget(userOp: any): Promise<boolean> {
  try {
    const callData = userOp.callData as `0x${string}` | undefined
    if (!callData) return false

    // Kernel-style execute(dest,value,data)
    const executeAbi = [
      {
        name: 'execute',
        type: 'function',
        inputs: [
          { name: 'dest', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'func', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
      },
    ] as const

    const decoded = decodeFunctionData({
      abi: executeAbi,
      data: callData,
    })

    if (decoded.functionName !== 'execute') return false

    const dest = decoded.args[0] as `0x${string}`
    const innerCallData = decoded.args[2] as `0x${string}`

    if (dest.toLowerCase() !== constants.Controller.toLowerCase()) {
      return false
    }

    const innerDecoded = decodeFunctionData({
      abi: AgentRegistrarControllerV2ABI,
      data: innerCallData,
    })

    const allowedFns = new Set(['register', 'registerWithUSDC', 'registerWithPermit'])
    if (!allowedFns.has(innerDecoded.functionName)) {
      return false
    }

    // If factory/factoryData is present, it's a deployment (counterfactual), so no code check needed yet
    if (userOp.factory || userOp.factoryData || userOp.initCode) {
      return true
    }

    const code = await publicClient.getCode({ address: userOp.sender })
    return code !== undefined && code !== '0x'
  } catch {
    return false
  }
}
