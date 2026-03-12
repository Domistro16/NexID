import { useState, useCallback, useMemo } from 'react'
import { useChainId, usePublicClient, useConfig, useSwitchChain } from 'wagmi'
import { getWalletClient } from '@wagmi/core'
import { namehash, encodeFunctionData, createPublicClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { buildTextRecords } from './setText'
import { addrResolver, ReferralData, EMPTY_REFERRAL_DATA, EMPTY_REFERRAL_SIGNATURE, ERC20_ABI } from '../constants/registerAbis'
import { getConstants, CHAIN_ID } from '../constant'
import { AgentRegistrarControllerABI } from '../lib/abi'
import { normalize } from 'viem/ens'
import { AgentRegistrarControllerAbi } from '@nexid/sdk'
import { buildPaymasterAndData, signPermit, eip2612Abi } from '../lib/permit'
import { create7702KernelAccount } from '@zerodev/ecdsa-validator'
import { KERNEL_V3_3 } from '@zerodev/sdk/constants'
import { createSmartAccountClient } from 'permissionless'

export type RegistrationStep = 'idle' | 'committing' | 'waiting' | 'approving' | 'registering' | 'done' | 'error'

export const useRegistration = () => {
  const [commitData, setCommitData] = useState<`0x${string}`[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<RegistrationStep>('idle')
  const [commitHash, setCommitHash] = useState<`0x${string}` | null>(null)
  const [registerHash, setRegisterHash] = useState<`0x${string}` | null>(null)
  const [humanUsdcBalance, setHumanUsdcBalance] = useState<bigint | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [secret, setSecret] = useState<`0x${string}`>('0x0000000000000000000000000000000000000000000000000000000000000000')

  const config = useConfig()
  const wagmiPublicClient = usePublicClient()
  const chainId = useChainId()
  const constants = getConstants(chainId)

  const activeChain = (chainId || CHAIN_ID) === 8453 ? base : baseSepolia

  // Create a fallback public client in case wagmi's usePublicClient returns undefined
  const fallbackPublicClient = useMemo(() => {
    return createPublicClient({ chain: activeChain, transport: http() })
  }, [activeChain])

  const publicClient = wagmiPublicClient ?? fallbackPublicClient

  // Build resolver data for text records and address
  const buildCommitDataFn = useCallback((
    textRecords: { key: string; value: string }[],
    newRecords: { key: string; value: string }[],
    label: string,
    owner: `0x${string}`,
  ) => {
    const complete = [...textRecords, ...newRecords]
    const validTextRecords = complete.filter(
      (r) => r.key.trim() !== '' && r.value.trim() !== '',
    )

    const builtData = buildTextRecords(
      validTextRecords,
      namehash(`${label}.id`),
    )
    const addrEncoded = encodeFunctionData({
      abi: addrResolver,
      functionName: 'setAddr',
      args: [namehash(`${label}.id`), owner],
    })
    const fullData = [...builtData, addrEncoded]
    setCommitData(fullData)
    return fullData
  }, [])

  // Generate a random secret for commit-reveal
  const generateSecret = useCallback((): `0x${string}` => {
    const randomBytes = new Uint8Array(32)
    crypto.getRandomValues(randomBytes)
    const newSecret = `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
    setSecret(newSecret)
    return newSecret
  }, [])

  // Fetch referral data from API
  const fetchReferralData = useCallback(async (
    referralCode: string,
    registrantAddress: string,
    name: string,
  ): Promise<{ referralData: ReferralData; signature: `0x${string}` }> => {
    if (!referralCode) {
      return {
        referralData: EMPTY_REFERRAL_DATA,
        signature: EMPTY_REFERRAL_SIGNATURE,
      }
    }

    try {
      const response = await fetch('/api/referral/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referralCode,
          registrantAddress,
          name,
        }),
      })

      const data = await response.json()

      if (data.success && data.referralData) {
        return {
          referralData: {
            referrer: data.referralData.referrer as `0x${string}`,
            registrant: data.referralData.registrant as `0x${string}`,
            nameHash: data.referralData.nameHash as `0x${string}`,
            referrerCodeHash: data.referralData.referrerCodeHash as `0x${string}`,
            deadline: BigInt(data.referralData.deadline),
            nonce: data.referralData.nonce as `0x${string}`,
          },
          signature: (data.signature || '0x') as `0x${string}`,
        }
      }
    } catch (error) {
      console.error('Error fetching referral data:', error)
    }

    return {
      referralData: EMPTY_REFERRAL_DATA,
      signature: EMPTY_REFERRAL_SIGNATURE,
    }
  }, [])

  const { switchChainAsync } = useSwitchChain()

  // Step 1: Commit transaction
  const commit = useCallback(async (
    label: string,
    owner: `0x${string}`,
    isPrimary: boolean,
    data: `0x${string}`[],
  ) => {
    setIsLoading(true)
    setError(null)
    setStep('committing')

    try {
      // Switch chain if necessary
      if (chainId !== activeChain.id) {
        await switchChainAsync({ chainId: activeChain.id })
      }

      // Get wallet client at call time (reliable with Privy + wagmi)
      const wc = await getWalletClient(config, { chainId: activeChain.id })

      const normalizedLabel = normalize(label)
      const commitSecret = generateSecret()

      // Generate commitment hash using makeCommitment on contract
      const commitment = await publicClient.readContract({
        address: constants.Controller,
        abi: AgentRegistrarControllerAbi,
        functionName: 'makeCommitment',
        args: [{
          name: normalizedLabel,
          owner,
          secret: commitSecret,
          resolver: constants.PublicResolver,
          data,
          reverseRecord: isPrimary,
          ownerControlledFuses: 0,
          deployWallet: false,
          walletSalt: 0n,
        }],
      })

      // Send commit transaction
      const [account] = await wc.getAddresses()
      const hash = await wc.writeContract({
        address: constants.Controller,
        abi: AgentRegistrarControllerAbi,
        functionName: 'commit',
        args: [commitment],
        account,
        chain: activeChain,
      })

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash })
      setCommitHash(hash)
      setStep('waiting')

      // Start 60 second countdown
      let remaining = 60
      setCountdown(remaining)
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          remaining--
          setCountdown(remaining)
          if (remaining <= 0) {
            clearInterval(interval)
            resolve()
          }
        }, 1000)
      })

      setStep('idle')
      setIsLoading(false)
      return hash
    } catch (err) {
      console.error('Error during commit:', err)
      setError(err as Error)
      setStep('error')
      setIsLoading(false)
      throw err
    }
  }, [config, publicClient, constants, generateSecret, activeChain, chainId, switchChainAsync])

  // Step 2: Approve USDC + Register with USDC (Standard Flow)
  const registerWithUSDC = useCallback(async (
    label: string,
    owner: `0x${string}`,
    isPrimary: boolean,
    referrer: string = '',
    data?: `0x${string}`[],
  ) => {
    setIsLoading(true)
    setError(null)

    try {
      // Switch chain if necessary
      if (chainId !== activeChain.id) {
        await switchChainAsync({ chainId: activeChain.id })
      }

      const wc = await getWalletClient(config, { chainId: activeChain.id })
      const [account] = await wc.getAddresses()

      const normalizedLabel = normalize(label)
      let resolverData = data && data.length > 0 ? data : commitData

      // Get price in USDC
      const priceResult = await publicClient.readContract({
        address: constants.Controller,
        abi: AgentRegistrarControllerABI,
        functionName: 'getPrice',
        args: [normalizedLabel],
      }) as [bigint, boolean]
      const priceUSDC = priceResult[0]
      // Human flow: use EIP-7702 smart account (EOA behaves as SCA)
      const smartAccount = await create7702KernelAccount(publicClient, {
        signer: wc as any,
        entryPoint: { address: constants.EntryPoint, version: '0.7' },
        kernelVersion: KERNEL_V3_3,
      })

      const ownerForRegistration = account as `0x${string}`

      // Build minimal resolver data if none was provided (non-commit flow)
      if (resolverData.length === 0) {
        const addrEncoded = encodeFunctionData({
          abi: addrResolver,
          functionName: 'setAddr',
          args: [namehash(`${normalizedLabel}.id`), ownerForRegistration],
        })
        resolverData = [addrEncoded]
      }

      // Check USDC balance for registration fee
      const feePayer = ownerForRegistration
      const feeBalance = await publicClient.readContract({
        address: constants.USDC,
        abi: eip2612Abi,
        functionName: 'balanceOf',
        args: [feePayer],
      }) as bigint

      setHumanUsdcBalance(feeBalance)
      if (feeBalance < priceUSDC) {
        throw new Error('INSUFFICIENT_USDC')
      }

      // Step 2a: Sign Paymaster Permit (gas in USDC)
      setStep('approving')

      const permitAmount = 10_000_000n // 10 USDC (6 decimals) for gas cap
      const permitSignature = await signPermit({
        publicClient: publicClient as any,
        walletClient: wc,
        ownerAddress: account,
        tokenAddress: constants.USDC,
        spenderAddress: constants.CirclePaymaster,
        value: permitAmount,
      })

      const paymasterAndData = buildPaymasterAndData({
        paymaster: constants.CirclePaymaster,
        usdc: constants.USDC,
        permitAmount,
        permitSignature,
      })

      // Step 2b: Build registration callData
      setStep('registering')

      const registerRequest = {
        name: normalizedLabel,
        owner: ownerForRegistration,
        secret,
        resolver: constants.PublicResolver,
        data: resolverData,
        reverseRecord: isPrimary,
        ownerControlledFuses: 0,
        deployWallet: false,
        walletSalt: 0n,
      }

      // Fetch referral data if referrer code is provided
      const { referralData, signature: referralSignature } = await fetchReferralData(
        referrer,
        ownerForRegistration,
        normalizedLabel,
      )

      const registerCallData = encodeFunctionData({
        abi: AgentRegistrarControllerABI,
        functionName: 'registerWithUSDC',
        args: [registerRequest, referralData, referralSignature],
      })

      const callData = await smartAccount.encodeCalls([{
        to: constants.Controller,
        value: 0n,
        data: registerCallData,
      }])

      const bundlerUrl = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL
      if (!bundlerUrl) {
        throw new Error('Missing NEXT_PUBLIC_PIMLICO_BUNDLER_URL')
      }

      const smartAccountClient = createSmartAccountClient({
        account: smartAccount,
        chain: activeChain,
        bundlerTransport: http(bundlerUrl),
        paymaster: {
          getPaymasterData: async () => ({
            paymasterAndData,
          }),
          getPaymasterStubData: async () => ({
            paymasterAndData,
          }),
        },
      })

      const userOpHash = await smartAccountClient.sendUserOperation({
        callData,
      })

      setRegisterHash(userOpHash as `0x${string}`)
      setStep('done')
      return userOpHash as `0x${string}`

    } catch (err) {
      console.error('Error during registration:', err)
      setError(err as Error)
      setStep('error')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [config, publicClient, constants, commitData, secret, activeChain, chainId, switchChainAsync, fetchReferralData])

  return {
    // State
    step,
    commitData,
    isLoading,
    commitHash,
    registerHash,
    humanUsdcBalance,
    error,
    countdown,
    secret,
    // Backward compat aliases
    commithash: commitHash,
    registerhash: registerHash,
    registerError: error,
    registerPending: isLoading,
    setIsLoading,
    // Functions
    buildCommitDataFn,
    commit,
    registerWithUSDC,
    // Backward compat wrapper
    register: async (
      label: string,
      address: `0x${string}`,
      _seconds: number,
      isPrimary: boolean,
      _lifetime: boolean,
      referrer: string = '',
      _useToken: boolean = false,
      _token: `0x${string}` = '0x0000000000000000000000000000000000000000',
      _usd1TokenData: any = null,
      _cakeTokenData: any = null,
      _priceData: any = null,
    ) => {
      return registerWithUSDC(label, address, isPrimary, referrer)
    },
  }
}
