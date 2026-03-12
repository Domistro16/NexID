import { useState } from 'react'
import { zeroAddress } from 'viem'
import { FaPlus } from 'react-icons/fa6'

type SetupProps = {
  owner: `0x${string}`
  setOwner: React.Dispatch<React.SetStateAction<`0x${string}`>>
  setDescription: React.Dispatch<React.SetStateAction<string>>
  setEmail: React.Dispatch<React.SetStateAction<string>>
  setTwitter: React.Dispatch<React.SetStateAction<string>>
  setWebsite: React.Dispatch<React.SetStateAction<string>>
  setGithub: React.Dispatch<React.SetStateAction<string>>
  setDiscord: React.Dispatch<React.SetStateAction<string>>
  setPhone: React.Dispatch<React.SetStateAction<string>>
  setAvatar: React.Dispatch<React.SetStateAction<string>>
  setNext: React.Dispatch<React.SetStateAction<number>>
  textRecords: { key: string; value: string }[]
  setTextRecords: React.Dispatch<
    React.SetStateAction<{ key: string; value: string }[]>
  >
  buildCommitData: () => void
}

const SetupModal = ({
  owner,
  setOwner,
  setDescription,
  setDiscord,
  setEmail,
  setTwitter,
  setWebsite,
  setGithub,
  setPhone,
  setAvatar,
  setNext,
  textRecords,
  setTextRecords,
  buildCommitData,
}: SetupProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    setOwner(e.target.value as `0x${string}`)
  }
  const [more, setMore] = useState(false)

  return (
    <div className="rounded-xl bg-neutral-800 px-10 py-5 mt-5 border-[0.5px] border-gray-400">
      <h1 className="text-3xl font-semibold text-[#FFF700] text-center">
        Setup your Profile
      </h1>
      <div className="flex justify-center mt-5 relative">
        <button className="rounded-full w-30 h-30 bg-gray-600 cursor-pointer flex items-center justify-center">
          <FaPlus className="text-4xl text-gray-300" />
        </button>
      </div>
      <div className="mt-5 space-y-3 text-sm">
        <p className="font-semibold">bnb address</p>
        <input
          value={owner ? owner : zeroAddress}
          onChange={handleChange}
          placeholder="0x"
          className="w-full mb-5 p-3 bg-neutral-700 rounded-lg focus:outline-none"
        />
      </div>
      <div className="flex justify-center flex-col items-center">
        <button
          className="flex p-3 bg-[#FFF700] rounded-lg text-neutral-900 text-sm font-semibold cursor-pointer hover:bg-[#B3AE00] transition-all duration-300"
          onClick={() => {
            setMore(true)
          }}
        >
          {' '}
          + Add more to profile
        </button>
        {more && (
          <div className="mt-10">
            <input
              onChange={(e) => {
                e.preventDefault()
                setAvatar(e.target.value as string)
              }}
              className="w-full mb-10 p-3 bg-neutral-700 rounded-lg focus:outline-none"
              placeholder="A link to your avatar image"
            />
            <textarea
              onChange={(e) => {
                e.preventDefault()
                setDescription(e.target.value as string)
              }}
              className="w-full mb-10 p-3 bg-neutral-700 rounded-lg focus:outline-none"
              placeholder="Describe yourself in a few words"
            />
            <input
              onChange={(e) => {
                e.preventDefault()
                setEmail(e.target.value as string)
              }}
              className="w-full mb-10 p-3 bg-neutral-700 rounded-lg focus:outline-none"
              placeholder="Type your email address"
            />
            <input
              type="tel"
              onChange={(e) => {
                e.preventDefault()
                setPhone(e.target.value as string)
              }}
              className="w-full mb-10 p-3 bg-neutral-700 rounded-lg focus:outline-none"
              placeholder="Type your telephone number"
            />
            <input
              onChange={(e) => {
                e.preventDefault()
                setTwitter(e.target.value as string)
              }}
              className="w-full mb-10 p-3 bg-neutral-700 rounded-lg focus:outline-none"
              placeholder="What is your Twitter handle?"
            />
            <input
              onChange={(e) => {
                e.preventDefault()
                setGithub(e.target.value as string)
              }}
              className="w-full mb-10 p-3 bg-neutral-700 rounded-lg focus:outline-none"
              placeholder="Your Github username goes here"
            />
            <input
              onChange={(e) => {
                e.preventDefault()
                setDiscord(e.target.value as string)
              }}
              className="w-full mb-10 p-3 bg-neutral-700 rounded-lg focus:outline-none"
              placeholder="Your Discord username goes here too"
            />
            <input
              onChange={(e) => {
                e.preventDefault()
                setWebsite(e.target.value as string)
              }}
              className="w-full mb-10 p-3 bg-neutral-700 rounded-lg focus:outline-none"
              placeholder="Your website URL"
            />
            {textRecords.map((record, index) => (
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
              onClick={() =>
                setTextRecords([...textRecords, { key: '', value: '' }])
              }
            >
              + Add Record
            </button>
          </div>
        )}

        <div className="flex space-x-5 w-full mt-10">
          <button
            className="p-3 bg-gray-300 text-black w-full rounded-lg font-semibold cursor-pointer"
            onClick={() => {
              setNext((prev) => prev - 1)
            }}
          >
            Back
          </button>

          <button
            className="p-3 bg-[#FFF700] w-full rounded-lg text-black font-semibold cursor-pointer"
            onClick={() => {
              setNext((prev) => prev + 1)
              buildCommitData()
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

export default SetupModal
