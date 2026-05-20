'use client'

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { useUSDCApproval } from '@/hooks/useUSDCApproval'
import { constants } from '@/constant'
import { AgentPriceTag } from './AgentPriceTag'
import { AgentRegistrarControllerV2ABI } from '@/lib/abi'
import { useRegistration } from '@/hooks/useRegistration'
import { normalizeDomainLabel } from '@/utils/domainUtils'

interface RegisterWithUSDCProps {
  name: string
}

export const RegisterWithUSDC = ({ name }: RegisterWithUSDCProps) => {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { checkAllowance, checkBalance, approve, isApproving } = useUSDCApproval(constants.Controller)
  const { registerWithUSDC, isLoading: registrationLoading, error: registrationError } = useRegistration()
  const normalizedName = normalizeDomainLabel(name)

  const [step, setStep] = useState<'check' | 'approve' | 'register' | 'done'>('check')
  const [balance, setBalance] = useState<bigint>(0n)
  const [allowance, setAllowance] = useState<bigint>(0n)
  const [priceUSDC, setPriceUSDC] = useState<bigint>(0n)
  const [isAgentName, setIsAgentName] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [txHash, setTxHash] = useState<string>('')
  const [isPriceLoading, setIsPriceLoading] = useState(true)

  // Fetch price on load
  useEffect(() => {
    const fetchPrice = async () => {
      if (!publicClient || !normalizedName) return
      setIsPriceLoading(true)
      try {
        const [price, isAgent] = await publicClient.readContract({
          address: constants.Controller,
          abi: AgentRegistrarControllerV2ABI,
          functionName: 'getPrice',
          args: [normalizedName],
        }) as [bigint, boolean]
        setPriceUSDC(price)
        setIsAgentName(isAgent)
      } catch (err) {
        console.error('Error fetching price:', err)
      } finally {
        setIsPriceLoading(false)
      }
    }
    fetchPrice()
  }, [normalizedName, publicClient])

  // Check balance and allowance on load
  useEffect(() => {
    const check = async () => {
      if (!address || priceUSDC === 0n) return

      const [bal, allow] = await Promise.all([
        checkBalance(),
        checkAllowance(),
      ])

      setBalance(bal)
      setAllowance(allow)

      if (allow >= priceUSDC) {
        setStep('register')
      } else {
        setStep('approve')
      }
    }
    check()
  }, [address, priceUSDC])

  const handleApprove = async () => {
    if (!publicClient) return
    try {
      const hash = await approve(priceUSDC)
      await publicClient.waitForTransactionReceipt({ hash })
      const newAllowance = await checkAllowance()
      setAllowance(newAllowance)
      setStep('register')
    } catch (error) {
      console.error('Approval failed:', error)
    }
  }

  const handleRegister = async () => {
    if (!address || priceUSDC === 0n || !normalizedName) return

    setIsRegistering(true)
    try {
      const hash = await registerWithUSDC(normalizedName, address, false)
      setTxHash(hash)
      setStep('done')
    } catch (error) {
      console.error('Registration failed:', error)
    } finally {
      setIsRegistering(false)
    }
  }

  const priceDisplay = Number(priceUSDC) / 1e6
  const balanceUSDC = Number(balance) / 1e6
  const hasEnoughBalance = balance >= priceUSDC

  return (
    <div className="space-y-6">
      {/* Price Display */}
      <div className="p-6 bg-gray-800 rounded-xl">
        {isPriceLoading ? (
          <div className="animate-pulse h-12 bg-gray-700 rounded" />
        ) : (
          <>
            <AgentPriceTag
              priceUsd={priceDisplay.toFixed(2)}
              priceEth="0.0000"
              isAgentName={isAgentName}
              name={normalizedName}
            />
            <div className="mt-2 text-sm text-gray-400">
              Payment in USDC only - no ETH required
            </div>
          </>
        )}
      </div>

      {/* USDC Balance */}
      <div className="p-4 bg-gray-800/50 rounded-lg flex justify-between items-center">
        <span className="text-gray-400">Your USDC Balance</span>
        <span className={hasEnoughBalance ? 'text-green-400' : 'text-red-400'}>
          ${balanceUSDC.toFixed(2)} USDC
        </span>
      </div>

      {!hasEnoughBalance && priceUSDC > 0n && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          Insufficient USDC balance. You need ${priceDisplay.toFixed(2)} USDC.
        </div>
      )}

      {/* Action Buttons */}
      {step === 'approve' && (
        <button
          onClick={handleApprove}
          disabled={isApproving || !hasEnoughBalance}
          className="w-full py-4 bg-blue-600 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50"
        >
          {isApproving ? 'Approving USDC...' : 'Approve USDC'}
        </button>
      )}

      {step === 'register' && (
        <button
          onClick={handleRegister}
          disabled={isRegistering || registrationLoading || !hasEnoughBalance}
          className="w-full py-4 bg-green-600 rounded-xl font-bold hover:bg-green-700 disabled:opacity-50"
        >
          {isRegistering || registrationLoading ? 'Registering...' : `Register for $${priceDisplay.toFixed(2)} USDC`}
        </button>
      )}

      {registrationError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {registrationError.message}
        </div>
      )}

      {step === 'done' && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
          <div className="text-green-400 font-bold text-lg mb-2">Registered!</div>
          <div className="text-sm text-gray-400 break-all">{txHash}</div>
        </div>
      )}

      {/* Gas Note */}
      <div className="text-center text-xs text-gray-500">
        No ETH needed - Gas paid via Circle Paymaster in USDC
      </div>
    </div>
  )
}
