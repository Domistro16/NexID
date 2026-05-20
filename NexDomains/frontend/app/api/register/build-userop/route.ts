import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import {
  createPublicClient,
  http,
  encodeFunctionData,
  namehash,
  toHex,
  encodePacked,
  keccak256,
  toBytes,
  zeroAddress,
} from 'viem'
import { getUserOperationHash } from 'viem/account-abstraction'
import { base } from 'viem/chains'
import { constants } from '@/constant'
import { AgentRegistrarControllerV2ABI, ResolverABI } from '@/lib/abi'
import { normalizeDomainLabel } from '@/utils/domainUtils'
import {
  buildIdentityNotificationProfile,
  mergeIdentityNotificationTextRecords,
} from '@/lib/identity-notifications'

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

const emptyReferralData = {
  referrer: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  registrant: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  nameHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
  referrerCodeHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
  deadline: 0n,
  nonce: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
}

const emptyReferralSignature = '0x' as `0x${string}`

/**
 * POST /api/register/build-userop
 *
 * Builds a UserOperation (v0.7) for the agent to sign.
 * Returns everything needed for the agent's wallet to sign and submit.
 */
export async function POST(request: NextRequest) {
  const rl = rateLimit(request)
  if (!rl.ok) return rl.response!
  try {
    const body = await request.json()
    const {
      name,
      sender,
      deployWallet = false,
      walletSalt = 0,
      textRecords = {},
      notificationProfile,
    } = body

    if (!name || !sender) {
      return NextResponse.json({ error: 'Missing name or sender' }, { status: 400 })
    }
    const normalizedName = normalizeDomainLabel(name)
    if (!normalizedName) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    }
    const reservedOwner = await publicClient.readContract({
      address: constants.Controller,
      abi: reservedOwnersAbi,
      functionName: 'reservedOwners',
      args: [keccak256(toBytes(normalizedName))],
    })
    if (reservedOwner && reservedOwner !== zeroAddress) {
      return NextResponse.json({ error: 'Name is reserved', name: normalizedName }, { status: 409 })
    }

    // Check availability
    const isAvailable = await publicClient.readContract({
      address: constants.Controller,
      abi: AgentRegistrarControllerV2ABI,
      functionName: 'available',
      args: [normalizedName],
    })

    if (!isAvailable) {
      return NextResponse.json({ error: 'Name not available' }, { status: 409 })
    }

    // Get price & type
    const [priceUSDC, isAgentName] = await publicClient.readContract({
      address: constants.Controller,
      abi: AgentRegistrarControllerV2ABI,
      functionName: 'getPrice',
      args: [normalizedName],
    }) as [bigint, boolean]
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
    const requiresCommit = isAgentName ? !agentModeEnabled : !skipCommitForNonAgents
    if (requiresCommit) {
      return NextResponse.json(
        { error: 'Commit-reveal is currently required for this name type', name: normalizedName },
        { status: 409 },
      )
    }

    // Build resolver data
    const identityNotificationProfile = notificationProfile
      ? buildIdentityNotificationProfile({
        name: normalizedName,
        owner: sender,
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

    const node = namehash(`${normalizedName}.id`)
    const resolverData: `0x${string}`[] = []

    resolverData.push(
      encodeFunctionData({
        abi: ResolverABI,
        functionName: 'setAddr',
        args: [node, sender as `0x${string}`],
      })
    )

    for (const [key, value] of Object.entries(effectiveTextRecords)) {
      if (key && value) {
        resolverData.push(
          encodeFunctionData({
            abi: ResolverABI,
            functionName: 'setText',
            args: [node, key, value as string],
          })
        )
      }
    }

    // Build registration calldata
    const registerRequest = {
      name: normalizedName,
      owner: sender as `0x${string}`,
      secret: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      resolver: constants.PublicResolver,
      data: resolverData,
      reverseRecord: true,
      ownerControlledFuses: 0,
      deployWallet,
      walletSalt: BigInt(walletSalt),
    }

    const registerCallData = encodeFunctionData({
      abi: AgentRegistrarControllerV2ABI,
      functionName: 'registerWithUSDC',
      args: [registerRequest, emptyReferralData, emptyReferralSignature],
    })

    // For AA wallet, wrap in execute() call (the AA wallet will call EntryPoint->execute eventually)
    const executeCallData = encodeFunctionData({
      abi: [
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
      ] as const,
      functionName: 'execute',
      args: [constants.Controller, 0n, registerCallData],
    })

    // Nonce (bigint)
    const nonce = await publicClient.readContract({
      address: constants.EntryPoint as `0x${string}`,
      abi: [
        {
          name: 'getNonce',
          type: 'function',
          inputs: [
            { name: 'sender', type: 'address' },
            { name: 'key', type: 'uint192' },
          ],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        },
      ] as const,
      functionName: 'getNonce',
      args: [sender as `0x${string}`, 0n],
    }) as bigint

    // Gas price (bigint)
    const gasPrice = await publicClient.getGasPrice()

    // --- Build initCode (if deploying wallet) ---
    let initCode: `0x${string}` = '0x'
    if (deployWallet) {
      const factoryAddr = constants.AccountFactory as `0x${string}`
      const factoryPayload = encodeFunctionData({
        abi: [
          {
            name: 'createAccount',
            type: 'function',
            inputs: [
              { name: 'owner', type: 'address' },
              { name: 'salt', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'address' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'createAccount',
        args: [sender as `0x${string}`, BigInt(walletSalt)],
      })

      // initCode = encodePacked([factoryAddress, factoryPayload])
      initCode = encodePacked(['address', 'bytes'], [factoryAddr, factoryPayload])
    }

    // --- Pack accountGasLimits (verification << 128 | call) ---
    const verificationGasLimit = 500000n
    const callGasLimit = 500000n
    const accountGasLimits = toHex((verificationGasLimit << 128n) | callGasLimit, { size: 32 })

    // preVerificationGas (bigint)
    const preVerificationGas = 50000n

    // --- Pack gasFees (maxPriority << 128 | maxFee) ---
    const maxFeePerGas = gasPrice // bigint (from publicClient.getGasPrice())
    const maxPriorityFeePerGas = 1_000_000n
    const gasFees = toHex((maxPriorityFeePerGas << 128n) | maxFeePerGas, { size: 32 })

    // --- Build paymasterAndData stub (client will fill permit bytes) ---
    // Structure: [paymaster(20)] [verificationGasLimit(16)] [postOpGasLimit(16)] [paymasterData(dynamic)]
    const paymasterVerificationGasLimit = 200000n
    const paymasterPostOpGasLimit = 15000n
    const paymasterAndData = encodePacked(
      ['address', 'uint128', 'uint128', 'bytes'],
      [
        constants.CirclePaymaster as `0x${string}`,
        paymasterVerificationGasLimit,
        paymasterPostOpGasLimit,
        '0x', // placeholder for dynamic paymasterData (client will append permit bytes)
      ]
    )

    // --- Build the v0.7 UserOperation object ---
    const userOp = {
      sender: sender as `0x${string}`,
      nonce, // bigint
      initCode, // bytes (either '0x' or encodePacked result)
      callData: executeCallData,
      accountGasLimits, // packed bytes32 hex
      preVerificationGas, // bigint
      gasFees, // packed bytes32 hex
      paymasterAndData, // bytes
      signature: '0x', // placeholder - client will populate after signing
    }

    // Compute hash server-side so client can sign it (optional but handy)
    const userOpHash = getUserOperationHash({
      userOperation: {
        sender: sender as `0x${string}`,
        nonce,
        callData: executeCallData,
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        maxFeePerGas,
        maxPriorityFeePerGas,
        signature: '0x' as `0x${string}`,
      },
      chainId: base.id,
      entryPointAddress: constants.EntryPoint,
      entryPointVersion: '0.7',
    })

    return NextResponse.json({
      success: true,
      name: normalizedName,
      fullName: `${normalizedName}.id`,
      priceUSDC: priceUSDC.toString(),
      isAgentName,
      entryPoint: constants.EntryPoint,
      circlePaymaster: constants.CirclePaymaster,
      // The client must:
      // 1) obtain Paymaster permit signature and produce paymasterData bytes
      // 2) replace the '0x' tail of paymasterAndData with the real paymasterData
      // 3) sign the userOpHash and set signature
      userOp,
      userOpHash,
      identityNotificationProfile,
      instructions: {
        1: `Ensure the sender has approved the NexID controller to spend at least ${priceUSDC.toString()} USDC base units.`,
        2: 'Get Paymaster Permit (EIP-2612) signature for USDC and assemble paymasterData bytes.',
        3: 'Replace the trailing paymasterData placeholder in paymasterAndData (currently empty) with real bytes.',
        4: 'Sign userOpHash and set userOp.signature to the signature.',
        5: 'Submit the completed UserOp to your submit endpoint /bundler or server submit route.',
      },
    })
  } catch (error: any) {
    console.error('build-userop error:', error)
    return NextResponse.json(
      { error: 'Failed to build UserOp', details: error?.message ?? String(error) },
      { status: 500 }
    )
  }
}
