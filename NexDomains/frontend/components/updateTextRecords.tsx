import { useState, useEffect } from 'react'
import { namehash, encodeFunctionData } from 'viem'
import { buildTextRecords } from '../hooks/setText'
import { useWriteContract } from 'wagmi'
import Modal from 'react-modal'
import { FaPlus } from 'react-icons/fa6'

interface UpdateProps {
  texts: { key: string; value: string }[]
  label: string
  owner: `0x${string}`
  resolverAddress: `0x${string}`
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  isOpen: boolean
  image: string
}

// Set app element for react-modal on client side only
if (typeof window !== 'undefined') {
  Modal.setAppElement(document.body)
}

const addrResolver = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'node',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'a',
        type: 'address',
      },
    ],
    name: 'setAddr',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const multiCall = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'nodehash',
        type: 'bytes32',
      },
      {
        internalType: 'bytes[]',
        name: 'data',
        type: 'bytes[]',
      },
    ],
    name: 'multicallWithNodeCheck',
    outputs: [
      {
        internalType: 'bytes[]',
        name: 'results',
        type: 'bytes[]',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const Update = ({
  texts,
  label,
  owner,
  resolverAddress,
  setIsOpen,
  isOpen,
}: UpdateProps) => {
  const [textRecords, setTextRecords] = useState([...texts])
  const {
    data: registerhash,
    error: registerError,
    isPending: registerPending,
    writeContractAsync: updateContract,
  } = useWriteContract()

  const [address, setOwner] = useState(owner)

  function onRequestClose(): void {
    setNext(0)
    setIsOpen(false)
  }

  const update = async () => {
    let validTextRecords = textRecords.filter(
      (r) => r.key.trim() !== '' && r.value.trim() !== '',
    )

    const builtData = buildTextRecords(
      validTextRecords,
      namehash(`${label as string}.id`),
    )
    const addrEncoded = encodeFunctionData({
      abi: addrResolver,
      functionName: 'setAddr',
      args: [namehash(`${label}.id`), !address ? owner : address],
    })

    const fullData = [...builtData, addrEncoded]
    const nodehash = namehash(`${label}.id`)

    try {
      await updateContract({
        abi: multiCall,
        address: resolverAddress,
        functionName: 'multicallWithNodeCheck',
        args: [nodehash, fullData],
      })
    } catch (error) {
      console.log(error)
      console.log(registerError)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    setOwner(e.target.value as `0x${string}`)
  }

  const [next, setNext] = useState(0)

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      closeTimeoutMS={300} // animation duration (matches CSS)
      className="modal-content"
      overlayClassName="modal-overlay"
    >
      {next == 0 ? (
        <div className="rounded-xl bg-neutral-800 px-10  py-5 mt-5 border-[0.5px] border-gray-400 h-[70vh] overflow-auto">
          <h1 className="text-3xl font-semibold text-[#FFF700] text-center">
            Update your Records
          </h1>
          <div className="flex justify-center mt-5 relative">
            <button className="rounded-full w-30 h-30 bg-gray-600 cursor-pointer flex items-center justify-center">
              <FaPlus className="text-4xl text-gray-300" />
            </button>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <p className="font-semibold">bnb address</p>
            <input
              value={address}
              onChange={handleChange}
              placeholder="0x"
              className="w-full mb-5 p-3 bg-neutral-700 rounded-lg focus:outline-none"
            />
          </div>
          <div className="mt-10">
            {textRecords
              .filter((record) => record.key !== 'avatar')
              .map((record, index) => (
                <div key={index} className="flex space-x-2 mb-3">
                  <input
                    type="text"
                    placeholder="Key (Format: com.youtube and not youtube.com)"
                    className="w-1/2 p-3 bg-neutral-700 rounded-lg text-sm focus:outline-none"
                    value={record.key}
                    onChange={(e) => {
                      const updated = [...textRecords]
                      updated[index].key = e.target.value
                      setTextRecords(updated)
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    className="w-1/2 p-3 bg-neutral-700 rounded-lg focus:outline-none"
                    value={record.value}
                    onChange={(e) => {
                      const updated = [...textRecords]
                      updated[index].value = e.target.value
                      setTextRecords(updated)
                    }}
                  />
                  <button
                    className="text-red-500 hover:text-red-700 text-sm font-semibold"
                    onClick={() => {
                      const updated = [...textRecords]
                      updated.splice(index, 1)
                      setTextRecords(updated)
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            <button
              className="px-4 py-2 bg-[#FFF700] text-black rounded-lg font-semibold hover:bg-[#B3AE00] mt-4"
              onClick={() => {
                setTextRecords([...textRecords, { key: '', value: '' }])
                update()
              }}
            >
              + Add Record
            </button>
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
                update()
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
            {!registerPending && registerhash && (
              <div className="flex justify-between items-center border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="text-gray-500 text-sm w-20">hash</div>
                <div className="font-bold text-black dark:text-white flex-wrap break-all text-sm">
                  {registerhash}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
export default Update
