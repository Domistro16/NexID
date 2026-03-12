'use client';

import ReactModal from 'react-modal'
import { XIcon, DuplicateIcon, LogoutIcon } from '@heroicons/react/outline'
import { useRouter } from 'next/navigation'
import { Avatar } from './useAvatar'
import { useAccount } from 'wagmi'
import { useDisconnect } from 'wagmi'
import { ArrowUpRightFromSquare, KeyRound } from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'

interface WalletModalProps {
  isOpen: boolean
  onRequestClose: () => void
  address: string
  name: string
  balance: string
}
export function WalletModal({
  isOpen,
  onRequestClose,
  name,
  balance,
}: WalletModalProps) {
  const short = (addr: string) => addr.slice(0, 4) + '…' + addr.slice(-4)
  const router = useRouter()
  const { address: fullAddress } = useAccount()
  const { disconnect } = useDisconnect()
  const { exportWallet, user, ready, authenticated, logout } = usePrivy()

  const disconnectWithSession = async () => {
    disconnect()
    await logout()
    onRequestClose()
  }

  // Check embedded wallet
  const isAuthenticated = ready && authenticated
  const hasEmbeddedWallet = !!user?.linkedAccounts.find(
    (account) =>
      account.type === 'wallet' &&
      account.walletClientType === 'privy' &&
      account.connectorType === 'embedded'
  )
  const canExport = isAuthenticated && hasEmbeddedWallet;

  return (
    <>
      <ReactModal
        isOpen={isOpen}
        onRequestClose={onRequestClose}
        overlayClassName="
    fixed inset-0
    bg-black/50
    flex items-center justify-center
    z-50
  "
        className={`
    relative
    w-full max-w-115
    bg-[#1a1b1f] rounded-2xl p-6 mx-4
    outline-none shadow-xl
    transform transition-transform duration-300 ease-out
    text-white
   ${isOpen ? 'translate-y-0' : 'translate-y-[100vh]'}
  `}
      >
        {/* Close */}
        <button
          onClick={onRequestClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-300 cursor-pointer"
        >
          <XIcon className="h-6 w-6" />
        </button>

        {/* Avatar */}
        <div className="flex justify-center">
          <Avatar
            name={name == '' ? `${fullAddress || ''}` : (name as string)}
            className="w-15 h-15"
          />
        </div>

        {/* Address */}
        {name ? (
          <h3 className="mt-4 text-center text-xl font-bold text-gray-300">
            {name}
          </h3>
        ) : (
          <h3 className="mt-4 text-center text-xl font-bold text-gray-300">
            {short(fullAddress as string)}
          </h3>
        )}

        {/* Balance */}
        <p className="mt-1 text-center text-sm font-semibold text-gray-100">
          {balance}
        </p>

        {/* Buttons */}
        <div className="mt-6 flex flex-wrap justify-center gap-4 mx-auto">
          <button
            onClick={() => {
              navigator.clipboard.writeText(fullAddress as string)
              alert('Address Copied')
            }}
            className="flex w-full flex-col items-center justify-center rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 cursor-pointer hover:scale-105 duration-200"
          >
            <DuplicateIcon className="h-5 w-5 text-gray-200" />
            <div>Copy Address</div>
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex w-full flex-col items-center justify-center rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-700 cursor-pointer hover:scale-105 duration-200"
          >
            <ArrowUpRightFromSquare className=" h-5 w-5 text-gray-100" />
            <div>Dashboard</div>
          </button>
          {canExport && (
            <button
              onClick={exportWallet}
              className="flex w-full flex-col items-center justify-center rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-700 cursor-pointer hover:scale-105 duration-200"
            >
              <KeyRound className=" h-5 w-5 text-gray-100" />
              <div>Export Key</div>
            </button>
          )}
          <button
            onClick={() => {
              disconnectWithSession()
            }}
            className="flex w-full flex-col items-center justify-center rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 cursor-pointer hover:scale-105 duration-200"
          >
            <LogoutIcon className=" h-5 w-5 text-gray-100" />
            <div>Disconnect</div>
          </button>
        </div>
      </ReactModal>
    </>
  )
}
