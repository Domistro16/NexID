import { useAccount, useReadContract } from 'wagmi'
import { Card, CardContent } from './ui/card'
import { constants } from '@/constant'
import { useEffect, useState } from 'react'
const CourseAbi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: '_user',
        type: 'address',
      },
    ],
    name: 'getUserPoints',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
]

export const CourseProgress = () => {
  const { address } = useAccount()
  const [total, setTotal] = useState(0)
  const { data: points } = useReadContract({
    abi: CourseAbi,
    address: constants.Course,
    functionName: 'getUserPoints',
    args: [address],
  })
  useEffect(() => {
    async function check() {
     const res = await fetch(`http://localhost:800/api/points/${address}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      const tot = await res.json()
      setTotal(tot)
    }
    check()
  }, [address])
  return (
    <div className="flex gap-2">
      {' '}
      <Card className="md:w-full md:p-4 mt-3 bg-neutral-800 border-[0.5px] border-neutral-500 text-gray-300">
        {' '}
        <CardContent>
          {' '}
          <h2 className="md:text-xl text-md font-bold mb-2">
            Completed Course Points
          </h2>{' '}
          <h2 className="text-xl font-bold mb-2">{Number(points)}</h2>
        </CardContent>
      </Card>
      <Card className="md:w-full mx-auto md:p-4 mt-3 bg-neutral-800 border-[0.5px] border-neutral-500 text-gray-300">
        {' '}
        <CardContent>
          {' '}
          <h2 className="md:text-xl text-md font-bold mb-2">
            Uncompleted Course Points
          </h2>{' '}
          <h2 className="text-xl font-bold mb-2">
            {Number(total) - Number(points) < 0
              ? 0
              : Number(total) - Number(points)}
          </h2>
        </CardContent>
      </Card>
    </div>
  )
}
