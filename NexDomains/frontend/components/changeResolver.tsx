import { useState } from 'react'
import { namehash } from 'viem'
import { useWriteContract } from 'wagmi'
import Modal from 'react-modal'
import { constants } from '../constant'

interface ResolverProps {
  label: string
  wrapped: boolean
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  isOpen: boolean
}

// Set app element for react-modal on client side only
if (typeof window !== 'undefined') {
  Modal.setAppElement(document.body)
}

const setResolverAbi = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'node',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'resolver',
        type: 'address',
      },
    ],
    name: 'setResolver',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const ChangeResolver = ({
  label,
  wrapped,
  setIsOpen,
  isOpen,
}: ResolverProps) => {
  const {
    data: setResolverHash,
    error: setResolverError,
    isPending: setResolverPending,
    writeContractAsync: setResolverContract,
  } = useWriteContract()
  function onRequestClose(): void {
    setNext(0)
    setIsOpen(false)
  }

  const [next, setNext] = useState(0)
  const [resolver, setResolverState] = useState(
    constants.PublicResolver as string,
  )

  const setResolver = async () => {
    if (wrapped == true) {
      try {
        await setResolverContract({
          abi: setResolverAbi,
          address: constants.NameWrapper,
          functionName: 'setResolver',
          args: [namehash(`${label}.id`), resolver],
        })
      } catch (error) { }
    } else {
      try {
        await setResolverContract({
          abi: setResolverAbi,
          address: constants.Registry,
          functionName: 'setResolver',
          args: [namehash(`${label}.id`), resolver],
        })
      } catch (error) {
        console.error(setResolverError)
      }
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
            Change Resolver for {label}.id
          </h1>
          <div className="flex justify-center mt-5">
            <div className="rounded-full w-30 h-30 bg-gray-600"></div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <p className="text-gray-400 text-sm">
              Type Your new Resolver Address here
            </p>
            <input
              value={resolver}
              onChange={(e) => {
                e.preventDefault()
                setResolverState(e.target.value)
              }}
              placeholder="Resolver"
              className="w-full mb-5 p-3 bg-neutral-700 rounded-lg focus:outline-none"
            />
          </div>

          <div className="flex space-x-5 w-full mt-5">
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
                setResolver()
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
                Change Resolver
              </div>
            </div>
            {!setResolverPending && setResolverHash && (
              <div className="flex justify-between items-center border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="text-gray-500 text-sm w-20">hash</div>
                <div className="font-bold text-black dark:text-white flex-wrap break-all text-sm">
                  {setResolverHash}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
export default ChangeResolver
