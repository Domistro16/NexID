import { encodeFunctionData } from 'viem'

interface TextRecord {
  key: string // e.g. 'description', 'avatar', 'com.twitter'
  value: string // the value user filled in
}

export function buildTextRecords(records: TextRecord[], node: `0x${string}`) {
  // Filter only non-empty records
  const validRecords = records.filter((record) => record.value.trim() !== '')

  // Encode each into a multicall input
  const encodedRecords: `0x${string}`[] = validRecords.map((record) => {
    return encodeFunctionData({
      abi: [
        {
          name: 'setText',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'key', type: 'string' },
            { name: 'value', type: 'string' },
          ],
          outputs: [],
        },
      ],
      functionName: 'setText',
      args: [
        node, // dummy node, resolver fixes it in multicall
        record.key,
        record.value,
      ],
    }) as `0x${string}`
  })

  return encodedRecords
}
