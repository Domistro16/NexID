'use client'

import { useState, useEffect } from 'react'
import { useWalletClient } from 'wagmi'
import { NexDomains } from '@nexid/sdk'
import { CHAIN_ID } from '../constant'

interface PaymentConfigProps {
    name: string
    onClose?: () => void
}

export const PaymentConfig = ({ name, onClose }: PaymentConfigProps) => {
    const { data: walletClient } = useWalletClient()
    const [x402Endpoint, setX402Endpoint] = useState('')
    const [paymentAddress, setPaymentAddress] = useState('')
    const [paymentEnabled, setPaymentEnabled] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isFetching, setIsFetching] = useState(true)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    // Fetch current payment config
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const sdk = new NexDomains({ chainId: CHAIN_ID })
                const [endpoint, enabled] = await Promise.all([
                    sdk.getX402Endpoint(name),
                    sdk.isPaymentEnabled(name),
                ])
                setX402Endpoint(endpoint)
                setPaymentEnabled(enabled)
                try {
                    const addr = await sdk.getPaymentAddress(name, CHAIN_ID)
                    setPaymentAddress(addr)
                } catch {
                    setPaymentAddress('')
                }
            } catch (error) {
                console.error('Failed to fetch payment config:', error)
            } finally {
                setIsFetching(false)
            }
        }

        fetchConfig()
    }, [name])

    const handleSave = async () => {
        if (!walletClient) {
            setMessage({ type: 'error', text: 'Please connect your wallet' })
            return
        }

        setIsLoading(true)
        setMessage(null)

        try {
            const sdk = new NexDomains({
                chainId: CHAIN_ID,
                walletClient: walletClient as any,
            })

            // Set x402 endpoint if provided
            if (x402Endpoint) {
                const hash = await sdk.setX402Endpoint(name, x402Endpoint)
                // We should ideally wait for receipt here too, but prioritized enable
            }

            // Set payment address for Base if provided
            if (paymentAddress) {
                await sdk.setPaymentAddress(name, CHAIN_ID, paymentAddress as `0x${string}`)
            }

            // Set payment enabled status
            const hash = await sdk.setPaymentEnabled(name, paymentEnabled)

            setMessage({ type: 'success', text: 'Transaction submitted. Waiting for confirmation...' })

            // Wait for transaction receipt
            const publicClient = sdk.publicClient
            await publicClient.waitForTransactionReceipt({ hash })

            setMessage({ type: 'success', text: 'Payment configuration saved!' })

            // Allow time for user to see success message
            setTimeout(() => {
                if (onClose) onClose()
            }, 1000)

        } catch (error) {
            console.error('Failed to save payment config:', error)
            setMessage({ type: 'error', text: 'Failed to save configuration' })
        } finally {
            setIsLoading(false)
        }
    }

    if (isFetching) {
        return (
            <div className="p-6 bg-gray-800 rounded-lg">
                <div className="animate-pulse flex flex-col gap-4">
                    <div className="h-6 bg-gray-700 rounded w-1/3"></div>
                    <div className="h-10 bg-gray-700 rounded"></div>
                    <div className="h-10 bg-gray-700 rounded w-1/2"></div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 bg-gray-800 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    🤖 Agent Payment Settings
                </h3>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white"
                    >
                        ✕
                    </button>
                )}
            </div>

            <p className="text-sm text-gray-400 mb-6">
                Configure x402/ERC-8004 payment settings for <span className="text-amber-400">{name}.id</span>
            </p>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Payment Address (Base)
                    </label>
                    <input
                        type="text"
                        value={paymentAddress}
                        onChange={(e) => setPaymentAddress(e.target.value)}
                        placeholder="0x..."
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        Where payments will be sent on Base
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        x402 Endpoint URL
                    </label>
                    <input
                        type="url"
                        value={x402Endpoint}
                        onChange={(e) => setX402Endpoint(e.target.value)}
                        placeholder="https://api.youragent.com/x402"
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        The endpoint where payment requests will be sent
                    </p>
                </div>

                <div className="flex items-center gap-3 py-2">
                    <input
                        type="checkbox"
                        checked={paymentEnabled}
                        onChange={(e) => setPaymentEnabled(e.target.checked)}
                        id="paymentEnabled"
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="paymentEnabled" className="text-sm text-gray-300">
                        Enable payments for this name
                    </label>
                </div>

                {message && (
                    <div className={`p-3 rounded-lg text-sm ${message.type === 'success'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                        {message.text}
                    </div>
                )}

                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-colors"
                >
                    {isLoading ? 'Saving...' : 'Save Configuration'}
                </button>
            </div>
        </div>
    )
}
