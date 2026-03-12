import { useState } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { maxUint256 } from 'viem'
import { base } from 'viem/chains'

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export const useUSDCApproval = (spender: `0x${string}`) => {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [isApproving, setIsApproving] = useState(false)

  const checkAllowance = async (): Promise<bigint> => {
    if (!address || !publicClient) return 0n

    return await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'allowance',
      args: [address, spender],
    })
  }

  const checkBalance = async (): Promise<bigint> => {
    if (!address || !publicClient) return 0n

    return await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [address],
    })
  }

  const approve = async (amount?: bigint): Promise<`0x${string}`> => {
    if (!walletClient || !address) throw new Error('Wallet not connected')

    setIsApproving(true)
    try {
      const hash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [spender, amount || maxUint256],
        chain: base,
        account: address,
      })
      return hash
    } finally {
      setIsApproving(false)
    }
  }

  return {
    checkAllowance,
    checkBalance,
    approve,
    isApproving,
  }
}
