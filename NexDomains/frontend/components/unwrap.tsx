import { useState } from 'react'
import { keccak256, toBytes } from 'viem'
import { useAccount, useWriteContract } from 'wagmi'
import Modal from 'react-modal'
import { constants } from '../constant'

interface UpdateProps {
  label: string
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  isOpen: boolean
}

// Set app element for react-modal on client side only
if (typeof window !== 'undefined') {
  Modal.setAppElement(document.body)
}

const unwrapETH2LD = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'labelhash',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'registrant',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'controller',
        type: 'address',
      },
    ],
    name: 'unwrapETH2LD',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const Unwrap = ({ label, setIsOpen, isOpen }: UpdateProps) => {
  const { address: owner } = useAccount()
  const {
    data: unwrapHash,
    error: unwrapError,
    isPending: unwrapPending,
    writeContractAsync: unwrapContract,
  } = useWriteContract()

  function onRequestClose(): void {
    setNext(0)
    setIsOpen(false)
  }

  const [next, setNext] = useState(0)
  const [manager, setManager] = useState(`${owner}`)
  const [address, setOwner] = useState(`${owner}`)

  const unwrap = async () => {
    const labelhash = keccak256(toBytes(label))
    try {
      await unwrapContract({
        abi: unwrapETH2LD,
        address: constants.NameWrapper,
        functionName: 'unwrapETH2LD',
        args: [labelhash, address, manager],
      })
    } catch (error) {
      console.log(error)
      console.log(unwrapError)
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
        <div className="rounded-xl bg-neutral-800 px-10 py-5 mt-5 border-[0.5px] border-gray-400 h-[60vh] overflow-auto">
          <h1 className="text-3xl font-semibold text-[#FFF700] text-center">
            Unwrap {label}.id
          </h1>
          <div className="flex justify-center mt-5">
            <div className="rounded-full w-30 h-30 bg-gray-600"></div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <p className="text-gray-400 text-sm">
              Type the address that will receive the name as an NFT
            </p>
            <input
              value={owner}
              onChange={(e) => {
                e.preventDefault()
                setOwner(e.target.value)
              }}
              placeholder="Owner"
              className="w-full mb-5 p-3 bg-neutral-700 rounded-lg focus:outline-none"
            />
            <p className="text-gray-400 text-sm mt-3">
              Type the address that will manage this name
            </p>
            <input
              value={manager}
              onChange={(e) => {
                e.preventDefault()
                setManager(e.target.value)
              }}
              placeholder="Type the address that will manage this name"
              className="w-full mb-5 p-3 bg-neutral-700 rounded-lg focus:outline-none"
            />
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
                unwrap()
              }}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
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
              <div className="font-bold text-black dark:text-white">
                Update Records
              </div>
            </div>
            {!unwrapPending && unwrapHash && (
              <div className="flex justify-between items-center border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="text-gray-500 text-sm w-20">hash</div>
                <div className="font-bold text-black dark:text-white flex-wrap break-all text-sm">
                  {unwrapHash}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
export default Unwrap
