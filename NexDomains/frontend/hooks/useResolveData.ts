import { useMemo } from 'react'
import { keccak256, namehash } from 'viem'
import { useReadContract, useChainId } from 'wagmi'
import { getConstants } from '../constant'
import {
  availableAbi,
  isWrapped,
  getData,
  Referral,
  expiresAbi,
  gExpiresAbi,
  ownerOf,
  ensOwner,
  resolveAbi,
  addr,
} from '../constants/resolveAbis'
import { useTextRecords } from './getTextRecords'
import { useENSName } from './getPrimaryName'
import { zeroAddress } from 'viem'

export const useResolveData = (label: string, walletAddress: `0x${string}`) => {
  const chainId = useChainId()
  const constants = getConstants(chainId)
  const node = namehash(`${label}.id`)
  const id = keccak256(label as any)

  // Account and text record keys
  const accountKeys = [
    'com.twitter',
    'com.reddit',
    'com.github',
    'com.discord',
    'com.youtube',
    'org.telegram',
    'com.snapchat',
    'com.tiktok',
    'email',
  ]
  const otherKeys = ['phone', 'url', 'avatar']
  const textKeys = [
    'com.twitter',
    'com.reddit',
    'com.github',
    'com.discord',
    'email',
    'phone',
    'url',
    'avatar',
    'description',
    'com.youtube',
    'org.telegram',
    'com.snapchat',
    'com.tiktok',
  ]

  // Contract reads
  const { data: available, isLoading: availableLoading } = useReadContract({
    address: constants.Controller,
    abi: availableAbi,
    functionName: 'available',
    args: [label],
  })

  const { data: wrapped } = useReadContract({
    abi: isWrapped,
    functionName: 'isWrapped',
    address: constants.NameWrapper,
    args: [node],
  })

  const { data, isLoading: wLoading } = useReadContract({
    abi: getData,
    functionName: 'getData',
    address: constants.NameWrapper,
    args: [node],
  })

  const { data: referrals } = useReadContract({
    abi: Referral,
    functionName: 'totalReferrals',
    address: constants.Referral,
    args: [walletAddress],
  })

  const { data: expires, isLoading: expiryLoading } = useReadContract({
    abi: expiresAbi,
    functionName: 'nameExpires',
    address: constants.BaseRegistrar,
    args: [id],
  })

  const { data: gexpires, isLoading: graceLoading } = useReadContract({
    abi: gExpiresAbi,
    functionName: 'nameExpires',
    address: constants.BaseRegistrar,
    args: [id],
  })

  const { data: owner, isPending: ownerLoading } = useReadContract({
    abi: ownerOf,
    functionName: 'ownerOf',
    address: constants.NameWrapper,
    args: [id],
  })

  const { data: manager, isPending: managerLoading } = useReadContract({
    abi: ensOwner,
    functionName: 'owner',
    address: constants.Registry,
    args: [node],
  })

  const { data: resolverResponse, isPending: resolverLoading } =
    useReadContract({
      abi: resolveAbi,
      functionName: 'resolver',
      address: constants.Registry,
      args: [node],
    })

  const resolver = useMemo(() => {
    if (!resolverLoading && resolverResponse) {
      return resolverResponse as `0x${string}`
    } else {
      return '' as `0x${string}`
    }
  }, [resolverLoading, resolverResponse])

  const { data: address, isPending } = useReadContract({
    abi: addr,
    functionName: 'addr',
    address: resolver,
    args: [node],
  })

  const { records: others, isLoading: othersLoading } = useTextRecords({
    resolverAddress: resolver,
    name: `${label}.id`,
    keys: otherKeys,
  })

  const { records: accounts, isLoading: accountsLoading } = useTextRecords({
    resolverAddress: resolver,
    name: `${label}.id`,
    keys: accountKeys,
  })

  const { records: texts, isLoading: textsLoading } = useTextRecords({
    resolverAddress: resolver,
    name: `${label}.id`,
    keys: textKeys,
  })

  // Wrapped owner data
  const wrappedOwner = useMemo(() => {
    const wrappedData = data as [string, string, bigint] | undefined
    if (wrappedData) {
      const [owner] = wrappedData || []
      return owner as string
    }
    return undefined
  }, [data])

  const fuseMask = useMemo(() => {
    const wrappedData = data as [string, bigint, bigint] | undefined
    if (wrappedData) {
      const [, fuses] = wrappedData || []
      return fuses as bigint
    }
    return 0n
  }, [data])

  // ENS names for addresses
  const { name: primaryName } = useENSName({
    owner: (walletAddress as `0x${string}`) || zeroAddress,
  })

  const { name: wrappedOwnerName } = useENSName({
    owner: wrappedOwner as `0x${string}`,
  })

  const { name: ownerName } = useENSName({
    owner: owner as `0x${string}`,
  })

  const { name: managerName } = useENSName({
    owner: manager as `0x${string}`,
  })

  const woname = wrappedOwnerName ?? wrappedOwner
  const oname = ownerName ?? owner
  const manname = managerName ?? manager

  const isLoading =
    availableLoading ||
    wLoading ||
    expiryLoading ||
    graceLoading ||
    resolverLoading ||
    ownerLoading ||
    managerLoading ||
    textsLoading ||
    accountsLoading ||
    othersLoading

  return {
    available,
    wrapped,
    wrappedOwner,
    owner,
    manager,
    expires,
    gexpires,
    resolver,
    address,
    referrals,
    texts,
    accounts,
    others,
    fuseMask,
    primaryName,
    woname,
    oname,
    manname,
    isLoading,
    isPending,
    wLoading,
    ownerLoading,
    managerLoading,
    node,
    id,
  }
}
