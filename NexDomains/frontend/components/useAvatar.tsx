import { useMemo } from 'react'
import { namehash } from 'viem'
import { useReadContract } from 'wagmi'
import { constants } from '../constant'

const resolverAbi = [
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

export function Avatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const gradients = [
    'from-purple-400 to-blue-400',
    'from-pink-500 to-yellow-500',
    'from-green-300 to-teal-400',
    'from-indigo-400 to-purple-500',
    'from-red-400 to-pink-400',

    // new additions:
    'from-yellow-300 to-red-300',
    'from-blue-200 to-teal-300',
    'from-pink-300 to-purple-300',
    'from-orange-400 to-pink-300',
    'from-lime-400 to-green-600',
    'from-cyan-400 to-blue-600',
    'from-rose-500 to-indigo-500',
    'from-emerald-300 to-green-500',
    'from-fuchsia-400 to-pink-600',
    'from-sky-400 to-blue-500',
    'from-amber-400 to-orange-600',
    'from-violet-400 to-blue-500',
  ]

  const node = namehash(name)
  const { data } = useReadContract({
    address: constants.PublicResolver,
    abi: resolverAbi,
    functionName: 'text',
    args: [node, 'avatar'],
  })

  const getCID = () => {
    if (typeof data != 'string') return
    const parts = data.split('/ipfs/')
    const cid = parts[1]?.split('/')[0]

    return cid
  }

  const gradient = useMemo(() => {
    // take last 8 hex chars of node, parse as int
    const tail = node.slice(-8)
    const num = parseInt(tail, 16)
    return gradients[num % gradients.length]
  }, [node])

  return (
    <>
      {data ? (
        <img
          src={`https://ipfs.io/ipfs/${getCID()}`}
          alt="Avatar"
          className={`${className} rounded-full`}
        />
      ) : (
        <div
          className={`${className} rounded-full bg-gradient-to-br ${gradient}`}
        />
      )}
    </>
  )
}
