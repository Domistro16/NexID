import hre from 'hardhat'
import {
  Address,
  Hex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { EnsStack } from './deployEnsFixture.js'

export type Mutable<T> = {
  -readonly [K in keyof T]: Mutable<T[K]>
}

type RegisterNameOptions = {
  label: string
  ownerAddress?: Address
  duration?: bigint
  secret?: Hex
  resolverAddress?: Address
  data?: Hex[]
  shouldSetReverseRecord?: boolean
  ownerControlledFuses?: number
  lifetime?: boolean
}

// Empty referral data for tests without referrals
const EMPTY_REFERRAL_DATA = {
  referrer: zeroAddress,
  registrant: zeroAddress,
  nameHash: zeroHash,
  referrerCodeHash: zeroHash,
  deadline: 0n,
  nonce: zeroHash,
} as const

const EMPTY_REFERRAL_SIGNATURE = '0x' as const

export const getDefaultRegistrationOptions = async ({
  label,
  ownerAddress,
  duration,
  secret,
  resolverAddress,
  data,
  shouldSetReverseRecord,
  ownerControlledFuses,
  lifetime,
}: RegisterNameOptions) => ({
  label,
  ownerAddress: await (async () => {
    if (ownerAddress) return ownerAddress
    const [deployer] = await hre.viem.getWalletClients()
    return deployer.account.address
  })(),
  duration: duration ?? BigInt(60 * 60 * 24 * 365),
  secret:
    secret ??
    '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
  resolverAddress: resolverAddress ?? zeroAddress,
  data: data ?? [],
  shouldSetReverseRecord: shouldSetReverseRecord ?? false,
  ownerControlledFuses: ownerControlledFuses ?? 0,
  lifetime: lifetime ?? false,
})

// Create the RegisterRequest struct for contract calls
export const getRegisterRequest = ({
  label,
  ownerAddress,
  duration,
  secret,
  resolverAddress,
  data,
  shouldSetReverseRecord,
  ownerControlledFuses,
  lifetime,
}: {
  label: string
  ownerAddress: Address
  duration: bigint
  secret: Hex
  resolverAddress: Address
  data: Hex[]
  shouldSetReverseRecord: boolean
  ownerControlledFuses: number
  lifetime: boolean
}) => ({
  name: label,
  owner: ownerAddress,
  duration,
  secret,
  resolver: resolverAddress,
  data,
  reverseRecord: shouldSetReverseRecord,
  ownerControlledFuses,
  lifetime,
})

// Legacy function for backward compatibility
export const getRegisterNameParameterArray = ({
  label,
  ownerAddress,
  duration,
  secret,
  resolverAddress,
  data,
  shouldSetReverseRecord,
  ownerControlledFuses,
  lifetime,
}: {
  label: string
  ownerAddress: Address
  duration: bigint
  secret: Hex
  resolverAddress: Address
  data: Hex[]
  shouldSetReverseRecord: boolean
  ownerControlledFuses: number
  lifetime: boolean
}) => {
  const immutable = [
    label,
    ownerAddress,
    duration,
    secret,
    resolverAddress,
    data,
    shouldSetReverseRecord,
    ownerControlledFuses,
    lifetime,
  ] as const
  return immutable as Mutable<typeof immutable>
}

export const commitName = async (
  { ethRegistrarController }: Pick<EnsStack, 'ethRegistrarController'>,
  params_: RegisterNameOptions,
) => {
  const params = await getDefaultRegistrationOptions(params_)
  const request = getRegisterRequest({
    label: params.label,
    ownerAddress: params.ownerAddress,
    duration: params.duration,
    secret: params.secret as Hex,
    resolverAddress: params.resolverAddress,
    data: params.data,
    shouldSetReverseRecord: params.shouldSetReverseRecord,
    ownerControlledFuses: params.ownerControlledFuses,
    lifetime: params.lifetime,
  })

  const testClient = await hre.viem.getTestClient()
  const [deployer] = await hre.viem.getWalletClients()

  const commitmentHash = await ethRegistrarController.read.makeCommitment([
    request,
  ])
  await ethRegistrarController.write.commit([commitmentHash], {
    account: deployer.account,
  })
  const minCommitmentAge = await ethRegistrarController.read.minCommitmentAge()
  await testClient.increaseTime({ seconds: Number(minCommitmentAge) })
  await testClient.mine({ blocks: 1 })

  return {
    params,
    request,
    hash: commitmentHash,
  }
}

export const registerName = async (
  { ethRegistrarController }: Pick<EnsStack, 'ethRegistrarController'>,
  params_: RegisterNameOptions,
) => {
  const params = await getDefaultRegistrationOptions(params_)
  const request = getRegisterRequest({
    label: params.label,
    ownerAddress: params.ownerAddress,
    duration: params.duration,
    secret: params.secret as Hex,
    resolverAddress: params.resolverAddress,
    data: params.data,
    shouldSetReverseRecord: params.shouldSetReverseRecord,
    ownerControlledFuses: params.ownerControlledFuses,
    lifetime: params.lifetime,
  })
  const { label, duration, lifetime } = params

  const testClient = await hre.viem.getTestClient()
  const [deployer] = await hre.viem.getWalletClients()

  const commitmentHash = await ethRegistrarController.read.makeCommitment([
    request,
  ])
  await ethRegistrarController.write.commit([commitmentHash], {
    account: deployer.account,
  })
  const minCommitmentAge = await ethRegistrarController.read.minCommitmentAge()
  await testClient.increaseTime({ seconds: Number(minCommitmentAge) })
  await testClient.mine({ blocks: 1 })

  const value = await ethRegistrarController.read
    .rentPrice([label, duration, lifetime])
    .then(({ base, premium }) => base + premium)

  // Use empty referral data for test registrations
  const referralData = {
    ...EMPTY_REFERRAL_DATA,
    registrant: params.ownerAddress,
  }

  await ethRegistrarController.write.register(
    [request, referralData, EMPTY_REFERRAL_SIGNATURE],
    {
      value,
      account: deployer.account,
    },
  )
}
