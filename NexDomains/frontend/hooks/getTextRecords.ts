import { useMemo } from 'react'
import { namehash } from 'viem'
import { useReadContracts } from 'wagmi'
import type { Abi } from 'viem'

const resolverAbi: Abi = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'node',
        type: 'bytes32',
      },
      {
        internalType: 'string',
        name: 'key',
        type: 'string',
      },
    ],
    name: 'text',
    outputs: [
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
]

interface UseTextRecordsProps {
  resolverAddress: `0x${string}`
  name: string
  keys: string[]
}

export function useTextRecords({
  resolverAddress,
  name,
  keys,
}: UseTextRecordsProps) {
  const node = useMemo(() => namehash(name), [name])

  const { data, isLoading, isError } = useReadContracts({
    contracts: keys.map((key) => ({
      address: resolverAddress,
      abi: resolverAbi,
      functionName: 'text',
      args: [node, key],
    })),
  })

  const records = useMemo(() => {
    if (!data) return []

    return keys
      .map((key, i) => ({
        key,
        value: (data[i]?.result as string) ?? '',
      }))
      .filter((r) => r.value && r.value.trim() !== '')
  }, [data, keys])
  return { records, isLoading, isError }
}
