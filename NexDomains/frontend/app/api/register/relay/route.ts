import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import {
  createPublicClient,
  http,
  encodeFunctionData,
  namehash,
  encodePacked,
  toHex,
} from 'viem'
import { getUserOperationHash } from 'viem/account-abstraction'
import { base } from 'viem/chains'
import { constants } from '@/constant'
import { AgentRegistrarControllerV2ABI, ResolverABI } from '@/lib/abi'
import { eip2612Abi, eip2612Permit } from '@/lib/permit'

const ENTRY_POINT_FALLBACK = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'

// Pimlico bundler for ERC-4337
const BUNDLER_URL = process.env.PIMLICO_BUNDLER_URL

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
})

/**
 * POST /api/register/relay
 *
 * Relayer endpoint for non-native agents (Claude, Molbo, Grok, etc.)
 *
 * Expects request body (example):
 * {
 *   "name": "trading-bot-v2",
 *   "owner": "0x...",           // Human's AA wallet address
 *   "deployWallet": true,       // Optional: deploy AA wallet for agent
 *   "walletSalt": 12345,        // Optional: salt for deterministic wallet
 *   "permit": { ... },          // Optional EIP-2612 permit
 *   "paymasterPermit": "0x...", // Optional: paymaster permit bytes
 *   "signature": "0x..."        // Optional: UserOp signature; if absent we return signing payload
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
    const {
      name,
      owner,
      deployWallet = false,
      walletSalt = Date.now(),
      textRecords = {},
      permit,
      paymasterPermit,
      signature,
    } = body

    // Validate
    if (!name || !owner) {
      return NextResponse.json({ error: 'Missing name or owner' }, { status: 400 })
    }

    if (signature && !paymasterPermit) {
      return NextResponse.json(
        { error: 'Missing paymasterPermit for gasless submission' },
        { status: 400 }
      )
    }

    // Check availability
    const isAvailable = await publicClient.readContract({
      address: constants.Controller,
      abi: AgentRegistrarControllerV2ABI,
      functionName: 'available',
      args: [name],
    })

    if (!isAvailable) {
      return NextResponse.json({ error: 'Name not available', name }, { status: 409 })
    }

    // Get price in USDC
    const [priceUSDC, isAgentName] = await publicClient.readContract({
      address: constants.Controller,
      abi: AgentRegistrarControllerV2ABI,
      functionName: 'getPrice',
      args: [name],
    }) as [bigint, boolean]

    // Build resolver data
    const node = namehash(`${name}.id`)
    const data: `0x${string}`[] = []

    data.push(encodeFunctionData({
      abi: ResolverABI,
      functionName: 'setAddr',
      args: [node, owner as `0x${string}`],
    }))

    for (const [key, value] of Object.entries(textRecords)) {
      if (key && value) {
        data.push(encodeFunctionData({
          abi: ResolverABI,
          functionName: 'setText',
          args: [node, key, value as string],
        }))
      }
    }

    // Build registration request
    const registerRequest = {
      name,
      owner: owner as `0x${string}`,
      secret: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      resolver: constants.PublicResolver,
      data,
      reverseRecord: true,
      ownerControlledFuses: 0,
      deployWallet,
      walletSalt: BigInt(walletSalt),
    }

    // Build the calldata (registerWithPermit or registerWithUSDC)
    let callData: `0x${string}`

    // Empty referral data (no referral for relay registrations by default)
    const emptyReferralData = {
      referrer: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      registrant: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      nameHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      referrerCodeHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      deadline: 0n,
      nonce: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    }
    const emptyReferralSignature = '0x' as `0x${string}`

    if (permit) {
      callData = encodeFunctionData({
        abi: AgentRegistrarControllerV2ABI,
        functionName: 'registerWithPermit',
        args: [registerRequest, permit, emptyReferralData, emptyReferralSignature],
      })
    } else {
      callData = encodeFunctionData({
        abi: AgentRegistrarControllerV2ABI,
        functionName: 'registerWithUSDC',
        args: [registerRequest, emptyReferralData, emptyReferralSignature],
      })
    }

    // Build UserOperation (v0.7) pieces
    const paymasterFields = await getPaymasterFields(paymasterPermit)

    // If deploying a wallet, build factory payload and initCode (v0.7 uses initCode)
    let initCode: `0x${string}` = '0x'
    if (deployWallet) {
      const factory = constants.AccountFactory as `0x${string}`
      const factoryData = encodeFunctionData({
        abi: [{
          name: 'createAccount',
          type: 'function',
          inputs: [{ name: 'owner', type: 'address' }, { name: 'salt', type: 'uint256' }],
          outputs: [{ name: '', type: 'address' }],
          stateMutability: 'nonpayable'
        }],
        functionName: 'createAccount',
        args: [owner as `0x${string}`, BigInt(walletSalt)]
      })
      // pack factory address + payload into initCode for v0.7
      initCode = encodePacked(['address', 'bytes'], [factory, factoryData])
    }

    // accountGasLimits (verificationGasLimit << 128 | callGasLimit) -> bytes32 hex
    const verificationGasLimit = 500000n
    const callGasLimit = 500000n
    const accountGasLimits = toHex((verificationGasLimit << 128n) | callGasLimit, { size: 32 })

    // preVerificationGas (bigint)
    const preVerificationGas = 50000n

    // gasFees (maxPriorityFeePerGas << 128 | maxFeePerGas) -> bytes32 hex
    const maxFunctionFeePerGas = await getGasPrice() // bigint
    const maxPriorityFeePerGas = 1000000n
    const gasFees = toHex((maxPriorityFeePerGas << 128n) | maxFunctionFeePerGas, { size: 32 })

    // paymasterAndData (v0.7 packed)
    let paymasterAndData: `0x${string}` = '0x'
    const {
      paymasterVerificationGasLimit = 200000n,
      paymasterPostOpGasLimit = 15000n
    } = paymasterFields

    if (paymasterFields.paymaster) {
      const pData = paymasterFields.paymasterData || '0x'
      paymasterAndData = encodePacked(
        ['address', 'uint128', 'uint128', 'bytes'],
        [
          paymasterFields.paymaster,
          paymasterVerificationGasLimit,
          paymasterPostOpGasLimit,
          pData
        ]
      )
    } else {
      // No paymaster available — explicit empty bytes (this is valid; bundler will interpret as no paymaster)
      paymasterAndData = '0x'
    }

    // Build the "AA wallet execute" call as callData for the UserOp
    // We wrap the controller register call inside an AA wallet execute(dest=Controller, 0, registerCallData)
    const executeCallData = encodeFunctionData({
      abi: [{
        name: 'execute',
        type: 'function',
        inputs: [
          { name: 'dest', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'func', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
      }] as const,
      functionName: 'execute',
      args: [constants.Controller, 0n, callData],
    })

    // userOp core fields: sender, nonce (bigint), initCode, callData (executeCallData),
    // accountGasLimits (bytes32), preVerificationGas (bigint), gasFees (bytes32), paymasterAndData (bytes), signature
    const nonce = await getNonce(owner) // bigint

    const userOp = {
      sender: owner as `0x${string}`,
      nonce,
      initCode,
      callData: executeCallData,
      accountGasLimits,
      preVerificationGas,
      gasFees,
      paymasterAndData,
      signature: signature || '0x',
    }

    // If signature not provided, return UserOp for signing — but compute the userOpHash using a sanitized object
    if (!signature) {
      // Build an unpacked v0.7-shaped object for getUserOperationHash
      const userOpForHash = {
        sender: userOp.sender,
        nonce: userOp.nonce,
        callData: userOp.callData,
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        maxFeePerGas: maxFunctionFeePerGas,
        maxPriorityFeePerGas,
        signature: '0x' as `0x${string}`,
      }

      const entryPointToUse = constants.EntryPoint || ENTRY_POINT_FALLBACK

      const userOpHash = getUserOperationHash({
        userOperation: userOpForHash,
        chainId: base.id,
        entryPointAddress: entryPointToUse,
        entryPointVersion: '0.7',
      })

      // return signing payload (convert bigints to strings where necessary)
      return new NextResponse(JSON.stringify({
        success: false,
        action: 'sign_required',
        userOp: {
          ...userOp,
          // convert bigint fields to strings for JSON transport
          nonce: userOp.nonce.toString(),
          preVerificationGas: typeof userOp.preVerificationGas === 'bigint' ? userOp.preVerificationGas.toString() : userOp.preVerificationGas,
        },
        userOpHash,
        message: 'Sign this UserOperation hash and resubmit with signature',
        priceUSDC: priceUSDC.toString(),
        isAgentName,
      }, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // If signature present, submit to bundler
    // IMPORTANT: bundler typically expects the UserOp fields in JS types (strings for hex fields, bigints or numbers for numeric)
    const txHash = await submitUserOp(userOp)

    // Get deployed wallet address if requested
    let agentWallet = null
    if (deployWallet) {
      agentWallet = await publicClient.readContract({
        address: constants.AccountFactory as `0x${string}`,
        abi: [{
          name: 'getAddress',
          type: 'function',
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'salt', type: 'uint256' },
          ],
          outputs: [{ type: 'address' }],
          stateMutability: 'view',
        }] as const,
        functionName: 'getAddress',
        args: [owner as `0x${string}`, BigInt(walletSalt)],
      })
    }

    return NextResponse.json({
      success: true,
      txHash,
      name,
      fullName: `${name}.id`,
      isAgentName,
      priceUSDC: priceUSDC.toString(),
      agentWallet,
      message: 'Registration submitted via bundler',
    })
  } catch (error: any) {
    console.error('Relay error:', error)
    return NextResponse.json({ error: 'Relay failed', details: error?.message ?? String(error) }, { status: 500 })
  }
}

// Helper functions
async function getNonce(sender: string): Promise<bigint> {
  const nonce = await publicClient.readContract({
    address: constants.EntryPoint as `0x${string}`,
    abi: [{
      name: 'getNonce',
      type: 'function',
      inputs: [
        { name: 'sender', type: 'address' },
        { name: 'key', type: 'uint192' },
      ],
      outputs: [{ type: 'uint256' }],
      stateMutability: 'view',
    }] as const,
    functionName: 'getNonce',
    args: [sender as `0x${string}`, 0n],
  })
  return nonce as bigint
}

async function getGasPrice(): Promise<bigint> {
  const gasPrice = await publicClient.getGasPrice()
  return gasPrice
}

// Local Paymaster Logic (v0.7 Split Fields)
async function getPaymasterFields(paymasterPermit: `0x${string}` | undefined): Promise<{
  paymaster?: `0x${string}`,
  paymasterData?: `0x${string}`,
  paymasterVerificationGasLimit?: bigint,
  paymasterPostOpGasLimit?: bigint
}> {
  const paymasterAddress = constants.CirclePaymaster as `0x${string}`
  const usdcAddress = constants.USDC as `0x${string}`
  const permitAmount = 10000000n // 10 USDC (6 decimals -> 10 * 10^6)

  if (!paymasterPermit) {
    // Return stub for estimation (dummy signature bytes)
    const dummySignature = '0x' + '00'.repeat(65) as `0x${string}`
    const paymasterData = encodePacked(
      ['uint8', 'address', 'uint256', 'bytes'],
      [0, usdcAddress, permitAmount, dummySignature]
    )
    return {
      paymaster: paymasterAddress,
      paymasterData,
      paymasterVerificationGasLimit: 200000n,
      paymasterPostOpGasLimit: 15000n
    }
  }

  // With valid permit bytes supplied by client
  const paymasterData = encodePacked(
    ['uint8', 'address', 'uint256', 'bytes'],
    [0, usdcAddress, permitAmount, paymasterPermit]
  )

  return {
    paymaster: paymasterAddress,
    paymasterData,
    paymasterVerificationGasLimit: 200000n,
    paymasterPostOpGasLimit: 15000n
  }
}

async function submitUserOp(userOp: any): Promise<string> {
  if (!BUNDLER_URL) {
    throw new Error('PIMLICO_BUNDLER_URL environment variable is not set')
  }
  const response = await fetch(BUNDLER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendUserOperation',
      params: [userOp, constants.EntryPoint || ENTRY_POINT_FALLBACK],
    }),
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(data.error.message)
  }

  return data.result // UserOp hash / tx identifier returned by bundler
}
