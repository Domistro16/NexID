import { useState, useEffect, useMemo } from 'react'
import { NexDomains } from '@nexid/sdk'
import { useChainId } from 'wagmi'
import { CHAIN_ID, constants } from '../constant'

interface PremiumCheckResult {
    isPremium: boolean
    requiresAuction: boolean
    fixedPrice: bigint
    hasActiveAuction: boolean
    isLoading: boolean
    error: Error | null
}

/**
 * Check if a name is premium and requires auction
 */
export const usePremiumCheck = (name: string): PremiumCheckResult => {
    const [isPremium, setIsPremium] = useState(false)
    const [requiresAuction, setRequiresAuction] = useState(false)
    const [fixedPrice, setFixedPrice] = useState<bigint>(0n)
    const [hasActiveAuction, setHasActiveAuction] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const chainId = useChainId()

    // Create SDK client
    const sdk = useMemo(() => new NexDomains({ chainId: chainId || CHAIN_ID }), [chainId])

    useEffect(() => {
        if (!name || name.length === 0) {
            setIsPremium(false)
            setRequiresAuction(false)
            return
        }

        const checkPremium = async () => {
            setIsLoading(true)
            setError(null)

            try {
                // Check premium registry via API
                const response = await fetch(`/api/premium/${encodeURIComponent(name)}`)
                const data = await response.json()

                if (data.error) {
                    throw new Error(data.error)
                }

                setIsPremium(data.isPremium ?? false)
                setRequiresAuction(data.requiresAuction ?? false)
                setFixedPrice(data.fixedPrice ? BigInt(data.fixedPrice) : 0n)
                setHasActiveAuction(data.hasActiveAuction ?? false)
            } catch (err) {
                console.error('Error checking premium status:', err)
                setError(err as Error)
                // Default to not premium on error
                setIsPremium(false)
                setRequiresAuction(false)
            } finally {
                setIsLoading(false)
            }
        }

        checkPremium()
    }, [name])

    return {
        isPremium,
        requiresAuction,
        fixedPrice,
        hasActiveAuction,
        isLoading,
        error,
    }
}
