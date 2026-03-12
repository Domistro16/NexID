import { useState, useEffect, useMemo } from 'react'
import { createPublicClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { useChainId } from 'wagmi'
import { getConstants, CHAIN_ID } from '../constant'
import { AgentRegistrarControllerABI } from '../lib/abi'

interface UseRegistrationPriceProps {
  label: string
}

interface PriceResult {
  priceUSDC: bigint
  isAgentName: boolean
}

export const useRegistrationPrice = ({
  label,
}: UseRegistrationPriceProps) => {
  const [priceResult, setPriceResult] = useState<PriceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const chainId = useChainId()
  const constants = getConstants(chainId)

  const publicClient = useMemo(() => {
    const chain = (chainId || CHAIN_ID) === 8453 ? base : baseSepolia
    return createPublicClient({ chain, transport: http() })
  }, [chainId])

  // Fetch price from controller (returns USDC price)
  useEffect(() => {
    if (!label || label.length === 0) {
      setPriceResult(null)
      return
    }

    const fetchPrice = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await publicClient.readContract({
          address: constants.Controller,
          abi: AgentRegistrarControllerABI,
          functionName: 'getPrice',
          args: [label],
        }) as [bigint, boolean]

        setPriceResult({
          priceUSDC: result[0],
          isAgentName: result[1],
        })
      } catch (err) {
        console.error('Error fetching price:', err)
        setError(err as Error)
        setPriceResult(null)
      } finally {
        setLoading(false)
      }
    }

    fetchPrice()
  }, [label, publicClient, constants.Controller])

  // Format price for display (USDC has 6 decimals)
  const price = useMemo(() => {
    if (!priceResult) {
      return {
        usdc: '0.00',
        usd: '0.00',
      }
    }

    const usdcValue = Number(priceResult.priceUSDC) / 1e6

    return {
      usdc: usdcValue < 1 ? usdcValue.toFixed(2) : usdcValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      usd: usdcValue < 1 ? usdcValue.toFixed(2) : usdcValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }
  }, [priceResult])

  return {
    price,
    loading,
    priceResult,
    isAgentName: priceResult?.isAgentName ?? false,
    error,
  }
}
