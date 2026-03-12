import { useState } from 'react'
import { keccak256, toBytes } from 'viem'
import { useAccount, useWriteContract } from 'wagmi'
import Modal from 'react-modal'
import { constants } from '@/constant'

interface UpdateProps {
  label: string
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  isOpen: boolean
}

// Set app element for react-modal on client side only
if (typeof window !== 'undefined') {
  Modal.setAppElement(document.body)
}

const wrapETH2LD = [
  {
    inputs: [
      {
        internalType: 'string',
        name: 'label',
        type: 'string',
      },
      {
        internalType: 'address',
        name: 'wrappedOwner',
        type: 'address',
      },
      {
        internalType: 'uint16',
        name: 'ownerControlledFuses',
        type: 'uint16',
      },
      {
        internalType: 'address',
        name: 'resolver',
        type: 'address',
      },
    ],
    name: 'wrapETH2LD',
    outputs: [
      {
        internalType: 'uint64',
        name: 'expiry',
        type: 'uint64',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const approve = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'to',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
    ],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const Wrap = ({ label, setIsOpen, isOpen }: UpdateProps) => {
  const { address: owner } = useAccount()
  const {
    data: wrapHash,
    error: wrapError,
    isPending: wrapPending,
    writeContractAsync: wrapContract,
  } = useWriteContract()
  const { data: approveHash, writeContractAsync: approveContract } =
    useWriteContract()

  const [next, setNext] = useState(0)

  function onRequestClose(): void {
    setIsOpen(false)
    setNext((prev) => prev - 1)
  }

  const resolver = constants.PublicResolver

  const [info, setInfo] = useState('')
  const [hash, setHash] = useState('')

  const wrap = async () => {
    const labelhash = keccak256(toBytes(label as string))
    try {
      setInfo(
        'Approve the Wrapper Contract to send .id name tokens from your wallet',
      )
      await approveContract({
        abi: approve,
        address: constants.BaseRegistrar,
        functionName: 'approve',
        args: [constants.NameWrapper, labelhash],
      })
      setHash(approveHash as string)
      setInfo('Wrap Name')
      await wrapContract({
        abi: wrapETH2LD,
        address: constants.NameWrapper,
        functionName: 'wrapETH2LD',
        args: [label, owner, 0, resolver],
      })
      setHash(wrapHash as string)
    } catch (error) {
      console.log(error)
      console.log(wrapError)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      closeTimeoutMS={300} // animation duration (matches CSS)
      className="modal-content"
      overlayClassName="modal-overlay"
    >
      {next == 0 ? (
        <div className="rounded-xl bg-neutral-800 px-10 py-5 mt-5 border-[0.5px] border-gray-400 h-80 overflow-auto">
          <h1 className="text-3xl font-semibold text-[#FFF700] text-center">
            Wrap {label}.id
          </h1>
          <div className="flex justify-center mt-10">
            Wrapping your Name gives you new features
          </div>

          <div className="flex space-x-5 w-full mt-10">
            <button
              className="p-3 bg-gray-300 text-black w-full rounded-lg font-semibold cursor-pointer"
              onClick={() => {
                setIsOpen(false)
              }}
            >
              Back
            </button>
            <button
              className="p-3 bg-[#FFF700] w-full rounded-lg text-black font-semibold cursor-pointer"
              onClick={() => {
                setNext((prev) => prev + 1)
                wrap()
              }}
            >
              Next
            </button>
          </div>
        </div>
      ) : next == 1 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-neutral-900 shadow-xl relative w-[300px] md:w-[450px] mx-auto flex flex-col gap-6">
          <button
            onClick={onRequestClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>

          <h2 className="text-2xl font-bold text-center text-neutral-800 dark:text-white">
            Confirm Details
          </h2>

          <p className="text-center text-gray-500">
            Double check these details before confirming in your wallet.
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="text-gray-500 text-sm">Name</div>
              <div className="flex items-center gap-2 font-bold text-black dark:text-white">
                {`${label}.id`}
                <div className="w-4 h-4 rounded-full bg-gradient-to-r from-pink-400 to-pink-600" />
              </div>
            </div>

            <div className="flex justify-between items-center border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="text-gray-500 text-sm">Action</div>
              <div className="font-bold text-black dark:text-white">{info}</div>
            </div>
            {!wrapPending && wrapHash && (
              <div className="flex justify-between items-center border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="text-gray-500 text-sm w-20">hash</div>
                <div className="font-bold text-black dark:text-white flex-wrap break-all text-sm">
                  {hash}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        ''
      )}
    </Modal>
  )
}
export default Wrap
