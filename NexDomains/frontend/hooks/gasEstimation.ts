import { ethers, BrowserProvider } from 'ethers'
import { keccak256, toBytes } from 'viem'
import { useCallback, useState, useEffect } from 'react'
import type { Account, Chain, Client, Transport } from 'viem'
import { Config, useConnectorClient } from 'wagmi'
import { constants } from '../constant'

export function clientToSigner(client: Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  }
  const provider = new BrowserProvider(transport as any, network)
  return provider.getSigner(account.address)
}

export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
  const { data: client } = useConnectorClient<Config>({ chainId })
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | undefined>(undefined)

  useEffect(() => {
    if (client) {
      clientToSigner(client).then(setSigner).catch(() => setSigner(undefined))
    } else {
      setSigner(undefined)
    }
  }, [client])

  return signer
}

// Updated ABI with RegisterRequest struct
const controllerAbi = [
  {
    inputs: [
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'uint256', name: 'duration', type: 'uint256' },
      { internalType: 'bool', name: 'lifetime', type: 'bool' },
    ],
    name: 'rentPrice',
    outputs: [
      {
        components: [
          { internalType: 'uint256', name: 'base', type: 'uint256' },
          { internalType: 'uint256', name: 'premium', type: 'uint256' },
        ],
        internalType: 'struct IPriceOracle.Price',
        name: 'price',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'name', type: 'string' }],
    name: 'available',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: 'commitment', type: 'bytes32' }],
    name: 'commit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'string', name: 'name', type: 'string' },
          { internalType: 'address', name: 'owner', type: 'address' },
          { internalType: 'uint256', name: 'duration', type: 'uint256' },
          { internalType: 'bytes32', name: 'secret', type: 'bytes32' },
          { internalType: 'address', name: 'resolver', type: 'address' },
          { internalType: 'bytes[]', name: 'data', type: 'bytes[]' },
          { internalType: 'bool', name: 'reverseRecord', type: 'bool' },
          { internalType: 'uint16', name: 'ownerControlledFuses', type: 'uint16' },
          { internalType: 'bool', name: 'lifetime', type: 'bool' },
        ],
        internalType: 'struct ETHRegistrarController.RegisterRequest',
        name: 'req',
        type: 'tuple',
      },
    ],
    name: 'makeCommitment',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'string', name: 'name', type: 'string' },
          { internalType: 'address', name: 'owner', type: 'address' },
          { internalType: 'uint256', name: 'duration', type: 'uint256' },
          { internalType: 'bytes32', name: 'secret', type: 'bytes32' },
          { internalType: 'address', name: 'resolver', type: 'address' },
          { internalType: 'bytes[]', name: 'data', type: 'bytes[]' },
          { internalType: 'bool', name: 'reverseRecord', type: 'bool' },
          { internalType: 'uint16', name: 'ownerControlledFuses', type: 'uint16' },
          { internalType: 'bool', name: 'lifetime', type: 'bool' },
        ],
        internalType: 'struct ETHRegistrarController.RegisterRequest',
        name: 'req',
        type: 'tuple',
      },
      {
        components: [
          { internalType: 'address', name: 'referrer', type: 'address' },
          { internalType: 'address', name: 'registrant', type: 'address' },
          { internalType: 'bytes32', name: 'nameHash', type: 'bytes32' },
          { internalType: 'bytes32', name: 'referrerCodeHash', type: 'bytes32' },
          { internalType: 'uint256', name: 'deadline', type: 'uint256' },
          { internalType: 'bytes32', name: 'nonce', type: 'bytes32' },
        ],
        internalType: 'struct ReferralVerifier.ReferralData',
        name: 'referralData',
        type: 'tuple',
      },
      { internalType: 'bytes', name: 'referralSignature', type: 'bytes' },
    ],
    name: 'register',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
]

// Helper to generate random secret
function generateSecret(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
}

// Empty referral data (when no referral code is used)
function getEmptyReferralData(owner: string, name: string) {
  return {
    referrer: ethers.ZeroAddress,
    registrant: owner,
    nameHash: keccak256(toBytes(name)),
    referrerCodeHash: ethers.ZeroHash,
    deadline: 0n,
    nonce: ethers.ZeroHash,
  }
}

export function useEstimateENSFees({
  name,
  owner,
  duration,
  lifetime = true,
}: {
  name: string
  owner: `0x${string}`
  duration: number
  lifetime?: boolean
}) {
  const signer = useEthersSigner()
  const [fees, setFees] = useState<{
    gasUnits: { commit: string; register: string }
    fee: { perGas: string; totalWei: string; totalEth: string }
    price: { base: string; premium: string; total: string; totalEth: string }
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const estimate = useCallback(async () => {
    const resolvedSigner = await signer
    if (!resolvedSigner || !name || !owner) return
    
    setLoading(true)
    setError(null)

    try {
      const controller = new ethers.Contract(
        constants.Controller,
        controllerAbi,
        resolvedSigner,
      )

      // Generate secret
      const secret = generateSecret()

      // Build RegisterRequest struct
      const registerRequest = {
        name,
        owner,
        duration: BigInt(duration),
        secret,
        resolver: constants.PublicResolver,
        data: [],
        reverseRecord: true,
        ownerControlledFuses: 0,
        lifetime,
      }

      // Get commitment using contract's makeCommitment function
      const commitment = await controller.makeCommitment(registerRequest)

      // Estimate commit gas
      const gasCommit: bigint = await controller.commit.estimateGas(commitment)

      // Get price
      const priceResult = await controller.rentPrice(name, duration, lifetime)
      const base: bigint = priceResult.base
      const premium: bigint = priceResult.premium
      const totalPrice: bigint = base + premium

      // For register gas estimation, we can't actually call it because:
      // 1. Commitment doesn't exist on-chain yet
      // 2. Even if it did, minCommitmentAge hasn't passed
      // 
      // Options:
      // A) Use a fixed estimate based on historical data
      // B) Use eth_estimateGas with state override (complex)
      // C) Just use a safe upper bound
      
      // Using estimated gas based on function complexity
      // Commit: ~46,000 gas
      // Register with referral: ~350,000-450,000 gas
      const gasRegister = BigInt(400_000) // Safe estimate

      // Get current fee data
      const provider = resolvedSigner.provider
      if (!provider) throw new Error('No provider')
      
      const feeData = await provider.getFeeData()
      const maxFee = feeData.maxFeePerGas ?? feeData.gasPrice!

      // Calculate fees
      const feeCommit = gasCommit * maxFee
      const feeRegister = gasRegister * maxFee
      const totalFee = feeCommit + feeRegister

      setFees({
        gasUnits: {
          commit: gasCommit.toString(),
          register: gasRegister.toString(),
        },
        fee: {
          perGas: maxFee.toString(),
          totalWei: totalFee.toString(),
          totalEth: ethers.formatEther(totalFee),
        },
        price: {
          base: base.toString(),
          premium: premium.toString(),
          total: totalPrice.toString(),
          totalEth: ethers.formatEther(totalPrice),
        },
      })
    } catch (e: any) {
      console.error('Fee estimation error:', e)
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [signer, name, owner, duration, lifetime])

  useEffect(() => {
    estimate()
  }, [estimate])

  return { fees, loading, error, refetch: estimate }
}