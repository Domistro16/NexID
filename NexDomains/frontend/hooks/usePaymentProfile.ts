import { useState, useEffect, useMemo } from 'react'
import { NexDomains } from '@nexid/sdk'
import { useChainId } from 'wagmi'
import { CHAIN_ID } from '../constant'

export interface PaymentProfile {
    x402Endpoint: string
    paymentAddress: `0x${string}`
    supportedChains: number[]
    agentMetadata: string
    paymentEnabled: boolean
}

interface UsePaymentProfileResult {
    profile: PaymentProfile | null
    isLoading: boolean
    error: Error | null
    refetch: () => Promise<void>
}

/**
 * Fetch x402/ERC-8004 payment profile for a domain
 */
export const usePaymentProfile = (
    name: string,
    overrideChainId?: number
): UsePaymentProfileResult => {
    const activeChainId = useChainId()
    const chainId = overrideChainId || activeChainId || CHAIN_ID
    const [profile, setProfile] = useState<PaymentProfile | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const fetchProfile = async () => {
        if (!name || name.length === 0) {
            setProfile(null)
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            const cleanName = name.replace('.id', '')
            const response = await fetch(`/api/x402/${encodeURIComponent(cleanName)}?t=${Date.now()}`)
            const data = await response.json()

            if (data.error) {
                throw new Error(data.error)
            }

            setProfile({
                x402Endpoint: data.x402Endpoint || '',
                paymentAddress: data.paymentAddress || '0x0000000000000000000000000000000000000000',
                supportedChains: data.supportedChains || [],
                agentMetadata: data.agentMetadata || '',
                paymentEnabled: data.paymentEnabled ?? false,
            })
        } catch (err) {
            console.error('Error fetching payment profile:', err)
            setError(err as Error)
            setProfile(null)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchProfile()
    }, [name, chainId])

    return {
        profile,
        isLoading,
        error,
        refetch: fetchProfile,
    }
}
