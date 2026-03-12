import { useState, useCallback } from 'react'
import {
  useAccount,
  useReadContract,
  useSignTypedData,
  useWaitForTransactionReceipt,
} from 'wagmi'
import type { Abi } from 'abitype'
import { encodeFunctionData } from 'viem'

type ForwardRequest = {
  from: `0x${string}`
  to: `0x${string}`
  value: bigint
  gas: bigint
  nonce: bigint
  data: `0x${string}`
}

// Hook arguments
interface UseGaslessContractWriteArgs {
  /** Deployed MinimalForwarder address */
  forwarderAddress: `0x${string}`
  /** ABI of MinimalForwarder (must include getNonce) */
  forwarderABI: Abi
  /** ABI of target contract (e.g. ["function setValue(uint256)"]) */
  targetABI: Abi
  /** Address of target contract (inherits ERC2771Context) */
  targetAddress: `0x${string}`
  /** The name of the function you want to call on target (e.g. "setValue") */
  functionName: string
  /** Arguments for that function (e.g. [42]) */
  functionArgs: readonly unknown[]
  /** (Optional) Gas limit to send in the ForwardRequest. Defaults to 100k */
  gasLimit?: bigint
  /** Your backend/Defender relay endpoint. It should accept { request, signature } */
  relayerUrl: string
  /** EIP-712 Domain params for MinimalForwarder */
  domain: {
    name: string
    version: string
    chainId: number
    verifyingContract: `0x${string}`
  }
  /** EIP-712 types for ForwardRequest (must match MinimalForwarder) */
  types: {
    ForwardRequest: {
      name: 'from' | 'to' | 'value' | 'gas' | 'nonce' | 'data'
      type: 'address' | 'uint256' | 'bytes'
    }[]
  }
}

/**
 * useGaslessContractWrite
 *
 * A custom hook that wraps:
 * 1. useContractRead to get forwarder.getNonce(userAddress)
 * 2. useSignTypedData to sign an EIP-712 ForwardRequest
 * 3. POST to your relayer endpoint (`relayerUrl`) with { request, signature }
 * 4. useWaitForTransaction to watch the relayed txHash
 *
 * Returns:
 *  - write(): triggers the entire flow (nonce → sign → send)
 *  - isLoading: true while signing or sending
 *  - isError: true if any step fails
 *  - error: the thrown error (signature/releray failure)
 *  - status: human-readable status ("Signing...", "Sending to relayer...", etc.)
 *  - txHash: the relayed transaction hash (if returned by your relayer)
 *  - isSuccess: true when tx is confirmed on-chain
 */
export function useGaslessContractWrite({
  forwarderAddress,
  forwarderABI,
  targetABI,
  targetAddress,
  functionName,
  functionArgs,
  gasLimit = 100_000n,
  relayerUrl,
  domain,
  types,
}: UseGaslessContractWriteArgs) {
  const { address: userAddress } = useAccount()

  // 1. Fetch forwarder nonce for this user
  const {
    data: nonceData,
    isLoading: nonceLoading,
    isError: nonceError,
  } = useReadContract({
    address: forwarderAddress,
    abi: forwarderABI,
    functionName: 'getNonce',
    args: [
      userAddress ??
        ('0x0000000000000000000000000000000000000000' as `0x${string}`),
    ],
  })

  // Convert returned nonce to bigint (viem returns bigint)
  const nonce: bigint = (nonceData as unknown as bigint) ?? 0n

  // Local state for status, error, txHash
  const [data, setTxHash] = useState<`0x${string}` | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [hookError, setHookError] = useState<Error | null>(null)

  // 2. Set up typed data signer
  const { signTypedDataAsync, isPending: isSigning } = useSignTypedData()

  // 3. When the relayed transaction hash is known, use useWaitForTransaction
  const { isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: data ?? undefined,
  })

  // 4. The main “write” function that orchestrates everything
  const writeContract = useCallback(async () => {
    if (!userAddress) {
      setHookError(new Error('Wallet not connected'))
      return
    }
    if (nonceError) {
      setHookError(new Error('Failed to fetch nonce'))
      return
    }
    if (nonceLoading) {
      return
    }

    try {
      // Encode target contract’s function call
      const targetCalldata = encodeFunctionData({
        abi: targetABI,
        functionName: functionName as any,
        args: functionArgs,
      }) as `0x${string}`

      // Build the ForwardRequest struct
      const request: ForwardRequest = {
        from: userAddress as `0x${string}`,
        to: targetAddress,
        value: 0n,
        gas: gasLimit,
        nonce: nonce,
        data: targetCalldata,
      }

      // Prompt user to sign EIP-712 typed ForwardRequest
      const signature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'ForwardRequest',
        message: request,
      })

      setIsSending(true)

      // 4. Send to relayer endpoint
      const response = await fetch(relayerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, signature }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(
          `Relayer error: ${response.status} ${response.statusText} – ${text}`,
        )
      }
      const { transactionHash } = await response.json()
      setTxHash(transactionHash)
    } catch (err: any) {
      console.error(err)
      setIsSending(false)
      setHookError(err)
    }
  }, [
    userAddress,
    nonce,
    nonceLoading,
    nonceError,
    targetABI,
    functionName,
    functionArgs,
    targetAddress,
    gasLimit,
    signTypedDataAsync,
    domain,
    types,
    relayerUrl,
  ])
  return {
    writeContract, // Call this to start the gasless flow
    isLoading: nonceLoading || isSigning || isSending,
    isError: Boolean(hookError),
    error: hookError,
    data,
    isSuccess: Boolean(isTxSuccess),
  }
}
