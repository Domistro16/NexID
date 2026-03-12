'use client';

import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { useAllOwnedNames } from '../hooks/getAllNames'
import { useEffect, useMemo, useState, useRef } from 'react'
import { WrappedBadge } from './badge'
import { Avatar } from './useAvatar'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search, SortAsc, SortDesc, MoreVertical, Image, Package, Settings, Star, X } from 'lucide-react'
import { shortenAddress } from '../utils/domainUtils'
import { useENSName } from '../hooks/getPrimaryName'
import { namehash, keccak256, toBytes } from 'viem'
import { constants } from '../constant'
import Modal from 'react-modal'
import DomainImage from './DomainImage'

// Set app element for react-modal on client side only
if (typeof window !== 'undefined') {
  Modal.setAppElement(document.body)
}

const THEME_KEY = 'nexid-theme'

// ABI definitions for contract interactions
const isWrappedAbi = [
  {
    inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
    name: 'isWrapped',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
]

const setAddrAbi = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'node', type: 'bytes32' },
      { internalType: 'address', name: 'a', type: 'address' },
    ],
    name: 'setAddr',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const wrapETH2LDAbi = [
  {
    inputs: [
      { internalType: 'string', name: 'label', type: 'string' },
      { internalType: 'address', name: 'wrappedOwner', type: 'address' },
      { internalType: 'uint16', name: 'ownerControlledFuses', type: 'uint16' },
      { internalType: 'address', name: 'resolver', type: 'address' },
    ],
    name: 'wrapETH2LD',
    outputs: [{ internalType: 'uint64', name: 'expiry', type: 'uint64' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const approveAbi = [
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const unwrapETH2LDAbi = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'labelhash', type: 'bytes32' },
      { internalType: 'address', name: 'registrant', type: 'address' },
      { internalType: 'address', name: 'controller', type: 'address' },
    ],
    name: 'unwrapETH2LD',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const setNameAbi = [
  {
    inputs: [{ internalType: 'string', name: 'name', type: 'string' }],
    name: 'setName',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

// Hook to check if domain is wrapped
function useIsWrapped(name: string) {
  const { data: wrapped } = useReadContract({
    abi: isWrappedAbi,
    functionName: 'isWrapped',
    address: constants.NameWrapper,
    args: [namehash(name)],
  })
  return wrapped as boolean | undefined
}

interface ActionModalProps {
  isOpen: boolean
  onClose: () => void
  domain: string
  isDark: boolean
}

// Domain Image Modal Component
function DomainImageModal({ isOpen, onClose, domain, isDark }: ActionModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      closeTimeoutMS={300}
      className="modal-content"
      overlayClassName="modal-overlay"
    >
      <div style={{
        background: isDark ? '#1a1a1a' : '#fff',
        borderRadius: '20px',
        padding: '24px',
        maxWidth: '500px',
        margin: 'auto',
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: isDark ? '#888' : '#666',
          }}
        >
          <X size={24} />
        </button>
        <h2 style={{
          fontSize: '20px',
          fontWeight: 600,
          color: isDark ? '#fff' : '#111',
          marginBottom: '20px',
          textAlign: 'center',
        }}>
          {domain}
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <DomainImage domain={domain} className="w-full max-w-md rounded-lg" />
        </div>
      </div>
    </Modal>
  )
}

// ABI to read current addr
const addrAbi = [
  {
    inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
    name: 'addr',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
]

// Change BSC Record Modal Component - sets the BSC address the domain resolves to
function ChangeBSCRecordModal({ isOpen, onClose, domain, isDark }: ActionModalProps) {
  const [bscAddress, setBscAddress] = useState('')
  const [step, setStep] = useState(0)
  const { writeContractAsync, isPending, data: hash } = useWriteContract()

  // Fetch current BSC address
  const { data: currentAddr } = useReadContract({
    abi: addrAbi,
    address: constants.PublicResolver,
    functionName: 'addr',
    args: [namehash(domain)],
  })
  const currentBscAddress = currentAddr as string | undefined

  const handleSetBSCRecord = async () => {
    try {
      await writeContractAsync({
        abi: setAddrAbi,
        address: constants.PublicResolver,
        functionName: 'setAddr',
        args: [namehash(domain), bscAddress as `0x${string}`],
      })
      setStep(1)
    } catch (error) {
      console.error('Set BSC record error:', error)
    }
  }

  const handleClose = () => {
    setStep(0)
    setBscAddress('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      closeTimeoutMS={300}
      className="modal-content"
      overlayClassName="modal-overlay"
    >
      <div style={{
        background: isDark ? '#1a1a1a' : '#fff',
        borderRadius: '20px',
        padding: '24px',
        maxWidth: '450px',
        margin: 'auto',
        position: 'relative',
      }}>
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: isDark ? '#888' : '#666',
          }}
        >
          <X size={24} />
        </button>

        {step === 0 ? (
          <>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              color: isDark ? '#fff' : '#111',
              marginBottom: '20px',
            }}>
              Change BSC Record for {domain}
            </h2>
            <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '16px', fontSize: '14px' }}>
              Enter the BSC address this domain should resolve to
            </p>
            <input
              value={bscAddress}
              onChange={(e) => setBscAddress(e.target.value)}
              placeholder={currentBscAddress || '0x...'}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                borderRadius: '12px',
                fontSize: '14px',
                color: isDark ? '#fff' : '#111',
                marginBottom: '20px',
              }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4',
                  color: isDark ? '#fff' : '#111',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSetBSCRecord}
                disabled={isPending || !bscAddress}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: isDark ? '#fff' : '#111',
                  color: isDark ? '#000' : '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: (isPending || !bscAddress) ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  opacity: (isPending || !bscAddress) ? 0.6 : 1,
                }}
              >
                {isPending ? 'Confirming...' : 'Update Record'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              color: isDark ? '#fff' : '#111',
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              BSC Record Updated!
            </h2>
            <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '16px', fontSize: '14px', textAlign: 'center' }}>
              {domain} now resolves to {bscAddress.slice(0, 6)}...{bscAddress.slice(-4)}
            </p>
            {hash && (
              <p style={{ color: isDark ? '#888' : '#999', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>
                TX: {hash}
              </p>
            )}
            <button
              onClick={handleClose}
              style={{
                width: '100%',
                padding: '12px',
                background: isDark ? '#fff' : '#111',
                color: isDark ? '#000' : '#fff',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: 500,
                marginTop: '16px',
              }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

// Wrap Modal Component
function WrapModal({ isOpen, onClose, domain, isDark }: ActionModalProps) {
  const label = domain.replace(/\.id$/, '')
  const { address } = useAccount()
  const [step, setStep] = useState(0)
  const [info, setInfo] = useState('')
  const { writeContractAsync: approveContract } = useWriteContract()
  const { writeContractAsync: wrapContract, isPending, data: hash } = useWriteContract()

  const handleWrap = async () => {
    const labelhash = keccak256(toBytes(label))
    try {
      setStep(1)
      setInfo('Approving wrapper contract...')
      await approveContract({
        abi: approveAbi,
        address: constants.BaseRegistrar,
        functionName: 'approve',
        args: [constants.NameWrapper, labelhash],
      })
      setInfo('Wrapping name...')
      await wrapContract({
        abi: wrapETH2LDAbi,
        address: constants.NameWrapper,
        functionName: 'wrapETH2LD',
        args: [label, address, 0, constants.PublicResolver],
      })
      setInfo('Wrap complete!')
    } catch (error) {
      console.error('Wrap error:', error)
      setInfo('Error wrapping name')
    }
  }

  const handleClose = () => {
    setStep(0)
    setInfo('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      closeTimeoutMS={300}
      className="modal-content"
      overlayClassName="modal-overlay"
    >
      <div style={{
        background: isDark ? '#1a1a1a' : '#fff',
        borderRadius: '20px',
        padding: '24px',
        maxWidth: '450px',
        margin: 'auto',
        position: 'relative',
      }}>
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: isDark ? '#888' : '#666',
          }}
        >
          <X size={24} />
        </button>

        {step === 0 ? (
          <>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              color: isDark ? '#fff' : '#111',
              marginBottom: '20px',
            }}>
              Wrap {domain}
            </h2>
            <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '20px', fontSize: '14px' }}>
              Wrapping your name gives you new features like permissions and subname control.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4',
                  color: isDark ? '#fff' : '#111',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleWrap}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: isDark ? '#fff' : '#111',
                  color: isDark ? '#000' : '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Wrap Name
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              color: isDark ? '#fff' : '#111',
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              {info}
            </h2>
            {hash && (
              <p style={{ color: isDark ? '#888' : '#999', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>
                TX: {hash}
              </p>
            )}
            {info === 'Wrap complete!' && (
              <button
                onClick={handleClose}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: isDark ? '#fff' : '#111',
                  color: isDark ? '#000' : '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  marginTop: '16px',
                }}
              >
                Done
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// Unwrap Modal Component
function UnwrapModal({ isOpen, onClose, domain, isDark }: ActionModalProps) {
  const label = domain.replace(/\.id$/, '')
  const { address } = useAccount()
  const [step, setStep] = useState(0)
  const [ownerAddress, setOwnerAddress] = useState(address || '')
  const [managerAddress, setManagerAddress] = useState(address || '')
  const { writeContractAsync, isPending, data: hash } = useWriteContract()

  const handleUnwrap = async () => {
    const labelhash = keccak256(toBytes(label))
    try {
      await writeContractAsync({
        abi: unwrapETH2LDAbi,
        address: constants.NameWrapper,
        functionName: 'unwrapETH2LD',
        args: [labelhash, ownerAddress as `0x${string}`, managerAddress as `0x${string}`],
      })
      setStep(1)
    } catch (error) {
      console.error('Unwrap error:', error)
    }
  }

  const handleClose = () => {
    setStep(0)
    setOwnerAddress(address || '')
    setManagerAddress(address || '')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      closeTimeoutMS={300}
      className="modal-content"
      overlayClassName="modal-overlay"
    >
      <div style={{
        background: isDark ? '#1a1a1a' : '#fff',
        borderRadius: '20px',
        padding: '24px',
        maxWidth: '450px',
        margin: 'auto',
        position: 'relative',
      }}>
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: isDark ? '#888' : '#666',
          }}
        >
          <X size={24} />
        </button>

        {step === 0 ? (
          <>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              color: isDark ? '#fff' : '#111',
              marginBottom: '20px',
            }}>
              Unwrap {domain}
            </h2>
            <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '16px', fontSize: '14px' }}>
              Owner address (receives the NFT)
            </p>
            <input
              value={ownerAddress}
              onChange={(e) => setOwnerAddress(e.target.value)}
              placeholder="Owner address"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                borderRadius: '12px',
                fontSize: '14px',
                color: isDark ? '#fff' : '#111',
                marginBottom: '16px',
              }}
            />
            <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '16px', fontSize: '14px' }}>
              Manager address
            </p>
            <input
              value={managerAddress}
              onChange={(e) => setManagerAddress(e.target.value)}
              placeholder="Manager address"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                borderRadius: '12px',
                fontSize: '14px',
                color: isDark ? '#fff' : '#111',
                marginBottom: '20px',
              }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4',
                  color: isDark ? '#fff' : '#111',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUnwrap}
                disabled={isPending}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: isDark ? '#fff' : '#111',
                  color: isDark ? '#000' : '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                {isPending ? 'Confirming...' : 'Unwrap'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              color: isDark ? '#fff' : '#111',
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              Transaction Submitted
            </h2>
            <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '16px', fontSize: '14px', textAlign: 'center' }}>
              Your unwrap transaction has been submitted.
            </p>
            {hash && (
              <p style={{ color: isDark ? '#888' : '#999', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>
                TX: {hash}
              </p>
            )}
            <button
              onClick={handleClose}
              style={{
                width: '100%',
                padding: '12px',
                background: isDark ? '#fff' : '#111',
                color: isDark ? '#000' : '#fff',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: 500,
                marginTop: '16px',
              }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

// Set Primary Name Modal Component
function SetPrimaryModal({ isOpen, onClose, domain, isDark }: ActionModalProps) {
  const [step, setStep] = useState(0)
  const { writeContractAsync, isPending, data: hash } = useWriteContract()

  const handleSetPrimary = async () => {
    try {
      await writeContractAsync({
        abi: setNameAbi,
        address: constants.ReverseRegistrar,
        functionName: 'setName',
        args: [domain],
      })
      setStep(1)
    } catch (error) {
      console.error('Set primary error:', error)
    }
  }

  const handleClose = () => {
    setStep(0)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      closeTimeoutMS={300}
      className="modal-content"
      overlayClassName="modal-overlay"
    >
      <div style={{
        background: isDark ? '#1a1a1a' : '#fff',
        borderRadius: '20px',
        padding: '24px',
        maxWidth: '450px',
        margin: 'auto',
        position: 'relative',
      }}>
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: isDark ? '#888' : '#666',
          }}
        >
          <X size={24} />
        </button>

        {step === 0 ? (
          <>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              color: isDark ? '#fff' : '#111',
              marginBottom: '20px',
            }}>
              Set as Primary Name
            </h2>
            <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '20px', fontSize: '14px' }}>
              Setting <strong>{domain}</strong> as your primary name will display it across dApps when you connect your wallet.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4',
                  color: isDark ? '#fff' : '#111',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSetPrimary}
                disabled={isPending}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: isDark ? '#fff' : '#111',
                  color: isDark ? '#000' : '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                {isPending ? 'Confirming...' : 'Set Primary'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 600,
              color: isDark ? '#fff' : '#111',
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              Primary Name Set!
            </h2>
            <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '16px', fontSize: '14px', textAlign: 'center' }}>
              {domain} is now your primary name.
            </p>
            {hash && (
              <p style={{ color: isDark ? '#888' : '#999', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>
                TX: {hash}
              </p>
            )}
            <button
              onClick={handleClose}
              style={{
                width: '100%',
                padding: '12px',
                background: isDark ? '#fff' : '#111',
                color: isDark ? '#000' : '#fff',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: 500,
                marginTop: '16px',
              }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

// Actions Dropdown Component
function ActionsDropdown({
  domain,
  isWrapped,
  isPrimary,
  isDark,
  onViewImage,
  onChangeResolver,
  onWrap,
  onUnwrap,
  onSetPrimary,
}: {
  domain: string
  isWrapped: boolean | undefined
  isPrimary: boolean
  isDark: boolean
  onViewImage: () => void
  onChangeResolver: () => void
  onWrap: () => void
  onUnwrap: () => void
  onSetPrimary: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const menuItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    width: '100%',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    color: isDark ? '#fff' : '#111',
    textAlign: 'left' as const,
    transition: 'background 0.15s ease',
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.2)' : '#e4e4e4'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : '#f4f4f4'
        }}
      >
        <MoreVertical size={18} color={isDark ? '#fff' : '#111'} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            background: isDark ? '#1a1a1a' : '#fff',
            borderRadius: '12px',
            boxShadow: isDark ? '0 10px 40px rgba(0,0,0,0.5)' : '0 10px 40px rgba(0,0,0,0.15)',
            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
            minWidth: '200px',
            zIndex: 100,
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            style={menuItemStyle}
            onClick={() => { onViewImage(); setIsOpen(false) }}
            onMouseEnter={(e) => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Image size={16} />
            View Domain Image
          </button>

          <button
            style={menuItemStyle}
            onClick={() => { onChangeResolver(); setIsOpen(false) }}
            onMouseEnter={(e) => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Settings size={16} />
            Change BSC Record
          </button>

          {isWrapped ? (
            <button
              style={menuItemStyle}
              onClick={() => { onUnwrap(); setIsOpen(false) }}
              onMouseEnter={(e) => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Package size={16} />
              Unwrap Domain
            </button>
          ) : (
            <button
              style={menuItemStyle}
              onClick={() => { onWrap(); setIsOpen(false) }}
              onMouseEnter={(e) => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Package size={16} />
              Wrap Domain
            </button>
          )}

          {!isPrimary && (
            <button
              style={menuItemStyle}
              onClick={() => { onSetPrimary(); setIsOpen(false) }}
              onMouseEnter={(e) => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Star size={16} />
              Set as Primary Name
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Domain Card with Actions
function DomainCard({
  domain,
  isDark,
  cardStyle,
  primaryName,
}: {
  domain: { name: string; expiryDate: number }
  isDark: boolean
  cardStyle: React.CSSProperties
  primaryName: string | undefined
}) {
  const isWrapped = useIsWrapped(domain.name)
  const isPrimary = primaryName === domain.name

  // Modal states
  const [showImageModal, setShowImageModal] = useState(false)
  const [showResolverModal, setShowResolverModal] = useState(false)
  const [showWrapModal, setShowWrapModal] = useState(false)
  const [showUnwrapModal, setShowUnwrapModal] = useState(false)
  const [showPrimaryModal, setShowPrimaryModal] = useState(false)

  // v2: Lifetime ownership - no expiry
  // Check if this is a v2 lifetime domain (expiryDate far in future or 0)
  const isLifetime = domain.expiryDate === 0 || domain.expiryDate > Date.now() / 1000 + 100 * 365 * 24 * 3600

  const nowSec = Date.now() / 1000
  const secondsLeft = domain.expiryDate - nowSec - 259200
  let statusText: string
  let statusColor: string

  if (isLifetime) {
    statusText = '✓ Lifetime'
    statusColor = '#22c55e'
  } else if (secondsLeft <= 0) {
    statusText = 'Expired'
    statusColor = '#ef4444'
  } else if (secondsLeft < 30 * 24 * 3600) {
    statusText = `Expires in ${Math.ceil(secondsLeft / 86400)} day${Math.ceil(secondsLeft / 86400) > 1 ? 's' : ''}`
    statusColor = '#f59e0b'
  } else {
    const months = Math.round(secondsLeft / (30 * 24 * 3600))
    statusText = `Expires in ${months} month${months > 1 ? 's' : ''}`
    statusColor = isDark ? '#888' : '#666'
  }

  const isExpired = !isLifetime && secondsLeft <= 0
  const isExpiringSoon = !isLifetime && secondsLeft > 0 && secondsLeft < 30 * 24 * 3600

  return (
    <>
      <div
        style={{
          ...cardStyle,
          padding: '20px 24px',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = isDark
            ? '0 30px 60px rgba(0,0,0,0.65)'
            : '0 28px 65px rgba(0,0,0,0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = isDark
            ? '0 25px 50px rgba(0,0,0,0.55)'
            : '0 22px 55px rgba(0,0,0,0.08)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Avatar name={domain.name} className="w-12 h-12 rounded-full" />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '16px', color: isDark ? '#fff' : '#111' }}>
                  {domain.name}
                </span>
                {isPrimary && (
                  <span style={{
                    padding: '2px 8px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '12px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#fff',
                  }}>
                    Primary
                  </span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: statusColor, marginTop: '2px' }}>
                {statusText}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <WrappedBadge name={domain.name} tag={'Manager'} />
              <WrappedBadge name={domain.name} tag={'Owner'} />
            </div>
            {isLifetime && (
              <div
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'rgba(34, 197, 94, 0.1)',
                  color: '#22c55e',
                }}
              >
                Lifetime
              </div>
            )}
            {(isExpired || isExpiringSoon) && (
              <div
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: isExpired
                    ? 'rgba(239, 68, 68, 0.1)'
                    : 'rgba(245, 158, 11, 0.1)',
                  color: isExpired ? '#ef4444' : '#f59e0b',
                }}
              >
                {isExpired ? 'Expired' : 'Expiring Soon'}
              </div>
            )}
            <ActionsDropdown
              domain={domain.name}
              isWrapped={isWrapped}
              isPrimary={isPrimary}
              isDark={isDark}
              onViewImage={() => setShowImageModal(true)}
              onChangeResolver={() => setShowResolverModal(true)}
              onWrap={() => setShowWrapModal(true)}
              onUnwrap={() => setShowUnwrapModal(true)}
              onSetPrimary={() => setShowPrimaryModal(true)}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <DomainImageModal
        isOpen={showImageModal}
        onClose={() => setShowImageModal(false)}
        domain={domain.name}
        isDark={isDark}
      />
      <ChangeBSCRecordModal
        isOpen={showResolverModal}
        onClose={() => setShowResolverModal(false)}
        domain={domain.name}
        isDark={isDark}
      />
      <WrapModal
        isOpen={showWrapModal}
        onClose={() => setShowWrapModal(false)}
        domain={domain.name}
        isDark={isDark}
      />
      <UnwrapModal
        isOpen={showUnwrapModal}
        onClose={() => setShowUnwrapModal(false)}
        domain={domain.name}
        isDark={isDark}
      />
      <SetPrimaryModal
        isOpen={showPrimaryModal}
        onClose={() => setShowPrimaryModal(false)}
        domain={domain.name}
        isDark={isDark}
      />
    </>
  )
}

export default function Names() {
  const { address, isDisconnected } = useAccount()
  const router = useRouter()
  const { domains, isLoading: domainsLoading } = useAllOwnedNames(address?.toLowerCase() as string)
  const { name: primaryName } = useENSName({ owner: address as `0x${string}` })
  const [sortBy, setSortBy] = useState<'name' | 'expiry'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    document.title = `My Names`
  }, [])

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored)
    }

    // Listen for body class changes (when nav toggles dark mode)
    const observer = new MutationObserver(() => {
      const isDarkMode = document.body.classList.contains('dark-mode')
      setTheme(isDarkMode ? 'dark' : 'light')
    })

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    // Check initial state from body class
    if (document.body.classList.contains('dark-mode')) {
      setTheme('dark')
    }

    return () => observer.disconnect()
  }, [])

  const isDark = theme === 'dark'

  // Filter by search query
  const filteredDomains = useMemo(() => {
    if (!searchQuery) return domains
    return domains.filter((d) =>
      d.name.toLowerCase().includes(searchQuery.toLowerCase()),
    )
  }, [domains, searchQuery])

  const sortedDomains = useMemo(() => {
    const arr = [...filteredDomains]
    arr.sort((a, b) => {
      let cmp: number
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else {
        cmp = a.expiryDate - b.expiryDate
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filteredDomains, sortBy, sortDir])

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const totalPages = Math.ceil(sortedDomains.length / perPage)

  const pageDomains = useMemo(() => {
    const start = (page - 1) * perPage
    return sortedDomains.slice(start, start + perPage)
  }, [sortedDomains, page, perPage])

  // Card styles
  const cardStyle = {
    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.92)',
    backdropFilter: 'saturate(180%) blur(28px)',
    border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.06)',
    borderRadius: '26px',
    boxShadow: isDark ? '0 25px 50px rgba(0,0,0,0.55)' : '0 22px 55px rgba(0,0,0,0.08)',
  }

  const buttonPrimaryStyle = {
    padding: '12px 24px',
    background: isDark ? '#fff' : '#111',
    color: isDark ? '#000' : '#fff',
    border: 'none',
    borderRadius: '40px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
    transition: 'all 0.25s ease',
  }

  if (isDisconnected) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="hero-spacer" />
        <div style={{ ...cardStyle, padding: '40px', textAlign: 'center', maxWidth: '400px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: isDark ? '#fff' : '#111', marginBottom: '16px' }}>
            Connect Wallet
          </h2>
          <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '24px' }}>
            Please connect your wallet to view your domains.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="hero-spacer" />
      <div className="flex flex-col mx-auto p-4 mb-20 md:mb-5 md:px-30 mt-10 lg:px-60">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 700, color: isDark ? '#f8f8f8' : '#111' }}>
              My Names
            </h2>
            <div style={{ fontSize: '14px', color: isDark ? '#aaa' : '#666' }}>
              {shortenAddress(address as string)}
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div style={{ ...cardStyle, padding: '16px 20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Search */}
              <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                <Search
                  style={{
                    position: 'absolute',
                    left: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: isDark ? '#888' : '#666',
                    width: '18px',
                    height: '18px',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search domains..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setPage(1)
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 48px',
                    background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                    border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                    borderRadius: '14px',
                    fontSize: '14px',
                    color: isDark ? '#fff' : '#111',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Sort buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    if (sortBy === 'name') {
                      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                    } else {
                      setSortBy('name')
                      setSortDir('asc')
                    }
                    setPage(1)
                  }}
                  style={{
                    padding: '10px 16px',
                    background: sortBy === 'name' ? (isDark ? '#fff' : '#111') : (isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4'),
                    color: sortBy === 'name' ? (isDark ? '#000' : '#fff') : (isDark ? '#aaa' : '#666'),
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Name
                  {sortBy === 'name' && (
                    sortDir === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />
                  )}
                </button>

                <button
                  onClick={() => {
                    if (sortBy === 'expiry') {
                      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                    } else {
                      setSortBy('expiry')
                      setSortDir('asc')
                    }
                    setPage(1)
                  }}
                  style={{
                    padding: '10px 16px',
                    background: sortBy === 'expiry' ? (isDark ? '#fff' : '#111') : (isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4'),
                    color: sortBy === 'expiry' ? (isDark ? '#000' : '#fff') : (isDark ? '#aaa' : '#666'),
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Expiry
                  {sortBy === 'expiry' && (
                    sortDir === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />
                  )}
                </button>
              </div>

              {/* Per page select */}
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value))
                  setPage(1)
                }}
                style={{
                  padding: '10px 16px',
                  background: isDark ? 'rgba(255,255,255,0.05)' : '#f4f4f4',
                  border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: isDark ? '#fff' : '#111',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value={5}>5 per page</option>
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
              </select>
            </div>
          </div>

          {/* Domain List */}
          {domainsLoading ? (
            <div style={{ ...cardStyle, padding: '60px 40px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: isDark ? '#fff' : '#111', marginBottom: '12px' }}>
                Loading...
              </h3>
              <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '24px' }}>
                Fetching your .id domains.
              </p>
            </div>
          ) : sortedDomains.length === 0 ? (
            <div style={{ ...cardStyle, padding: '60px 40px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: isDark ? '#fff' : '#111', marginBottom: '12px' }}>
                No domains found
              </h3>
              <p style={{ color: isDark ? '#aaa' : '#666', marginBottom: '24px' }}>
                {searchQuery
                  ? 'No domains match your search query.'
                  : 'You don\'t have any .id domains yet.'}
              </p>
              {!searchQuery && (
                <button
                  style={buttonPrimaryStyle}
                  onClick={() => router.push('/')}
                >
                  Register a Domain
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pageDomains.map((domain, idx) => (
                  <DomainCard
                    key={domain.name + idx}
                    domain={domain}
                    isDark={isDark}
                    cardStyle={cardStyle}
                    primaryName={primaryName as string | undefined}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '24px' }}>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: page === 1 ? (isDark ? '#333' : '#eee') : (isDark ? '#fff' : '#111'),
                      color: page === 1 ? (isDark ? '#666' : '#999') : (isDark ? '#000' : '#fff'),
                      border: 'none',
                      cursor: page === 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <div style={{ fontSize: '14px', color: isDark ? '#aaa' : '#666' }}>
                    Page {page} of {totalPages}
                  </div>

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: page === totalPages ? (isDark ? '#333' : '#eee') : (isDark ? '#fff' : '#111'),
                      color: page === totalPages ? (isDark ? '#666' : '#999') : (isDark ? '#000' : '#fff'),
                      border: 'none',
                      cursor: page === totalPages ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              )}

              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px', color: isDark ? '#888' : '#666' }}>
                Showing {pageDomains.length} of {sortedDomains.length} domains
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
