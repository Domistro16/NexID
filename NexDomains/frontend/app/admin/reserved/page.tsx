'use client'

import { useMemo, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useChainId } from 'wagmi'
import { getConstants } from '@/constant'
import { AgentRegistrarControllerABI } from '@/lib/abi'
import { normalize } from 'viem/ens'

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

export default function ReservedAdminPage() {
  const { address } = useAccount()
  const chainId = useChainId()
  const constants = getConstants(chainId)
  const { writeContractAsync, isPending } = useWriteContract()

  const { data: ownerAddr } = useReadContract({
    address: constants.Controller,
    abi: AgentRegistrarControllerABI,
    functionName: 'owner',
  })

  const isOwner = useMemo(() => {
    if (!address || !ownerAddr) return false
    return address.toLowerCase() === (ownerAddr as string).toLowerCase()
  }, [address, ownerAddr])

  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [batch, setBatch] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const normalizedName = name ? normalize(name) : ''

  const handleReserve = async () => {
    setStatus(null)
    await writeContractAsync({
      address: constants.Controller,
      abi: AgentRegistrarControllerABI,
      functionName: 'reserveName',
      args: [normalizedName, owner as `0x${string}`],
    })
    setStatus(`Reserved ${normalizedName}`)
  }

  const handleClear = async () => {
    setStatus(null)
    await writeContractAsync({
      address: constants.Controller,
      abi: AgentRegistrarControllerABI,
      functionName: 'clearReservation',
      args: [normalizedName],
    })
    setStatus(`Cleared ${normalizedName}`)
  }

  const handleMint = async () => {
    setStatus(null)
    const req = {
      name: normalizedName,
      owner: owner as `0x${string}`,
      secret: ZERO_HASH as `0x${string}`,
      resolver: constants.PublicResolver,
      data: [] as `0x${string}`[],
      reverseRecord: false,
      ownerControlledFuses: 0,
      deployWallet: false,
      walletSalt: 0n,
    }
    await writeContractAsync({
      address: constants.Controller,
      abi: AgentRegistrarControllerABI,
      functionName: 'mintReserved',
      args: [req],
    })
    setStatus(`Minted ${normalizedName} to ${owner}`)
  }

  const handleBatchReserve = async () => {
    setStatus(null)
    const lines = batch
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const names: string[] = []
    const owners: `0x${string}`[] = []

    for (const line of lines) {
      const [n, o] = line.split(',').map((v) => v.trim())
      if (n && o) {
        names.push(normalize(n))
        owners.push(o as `0x${string}`)
      }
    }

    await writeContractAsync({
      address: constants.Controller,
      abi: AgentRegistrarControllerABI,
      functionName: 'reserveNamesBatch',
      args: [names, owners],
    })
    setStatus(`Batch reserved ${names.length} names`)
  }

  if (!isOwner) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold mb-2">Reserved Names Admin</h1>
        <p className="text-muted-foreground">Only the contract owner can access this page.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-6">Reserved Names Admin</h1>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold">Name</label>
          <input
            className="input-field mt-2 w-full"
            placeholder="example-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-semibold">Owner Address</label>
          <input
            className="input-field mt-2 w-full"
            placeholder="0x..."
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <button className="btn-primary" onClick={handleReserve} disabled={isPending || !normalizedName || !owner}>
            Reserve
          </button>
          <button className="btn-secondary" onClick={handleClear} disabled={isPending || !normalizedName}>
            Clear
          </button>
          <button className="btn-secondary" onClick={handleMint} disabled={isPending || !normalizedName || !owner}>
            Mint Reserved
          </button>
        </div>

        <div className="mt-8">
          <label className="text-sm font-semibold">Batch Reserve</label>
          <p className="text-xs text-muted-foreground mt-1">One per line: `name,0xOwner`</p>
          <textarea
            className="input-field mt-2 w-full h-32"
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            placeholder="alpha,0x...\nbeta,0x..."
          />
          <div className="mt-3">
            <button className="btn-primary" onClick={handleBatchReserve} disabled={isPending || !batch.trim()}>
              Batch Reserve
            </button>
          </div>
        </div>

        {status && <p className="text-sm text-green-500">{status}</p>}
      </div>
    </div>
  )
}
