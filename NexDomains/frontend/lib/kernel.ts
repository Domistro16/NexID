import type { PublicClient, WalletClient, Address } from 'viem'
import { createKernelAccount } from '@zerodev/sdk'
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator'
import { KERNEL_V3_3 } from '@zerodev/sdk/constants'

type EntryPointConfig = {
  address: Address
  version: '0.7'
}

type KernelAccountParams = {
  publicClient: PublicClient
  walletClient: WalletClient
  entryPoint: EntryPointConfig
  index?: bigint
}

export async function getKernelAccount({
  publicClient,
  walletClient,
  entryPoint,
  index = 0n,
}: KernelAccountParams) {
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: walletClient as any,
    entryPoint,
    kernelVersion: KERNEL_V3_3,
  })

  return await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion: KERNEL_V3_3,
    index,
  })
}
