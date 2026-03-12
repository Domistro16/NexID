// NexID v2 ABIs - Agent Registration System
// Re-export SDK ABIs for convenience
export {
  AgentPriceOracleAbi,
  AgentRegistrarControllerAbi,
  AgentRegistrarControllerAbi as Controller, // Backward compatibility alias
  AgentPublicResolverAbi,
  NameWrapperAbi,
} from '@nexid/sdk'

export const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
]

// v2 RegisterRequest - no duration, always lifetime
export interface RegisterRequest {
  name: string
  owner: `0x${string}`
  secret: `0x${string}`
  resolver: `0x${string}`
  data: `0x${string}`[]
  reverseRecord: boolean
  ownerControlledFuses: number
}

// ReferralData struct
export interface ReferralData {
  referrer: `0x${string}`
  registrant: `0x${string}`
  nameHash: `0x${string}`
  referrerCodeHash: `0x${string}`
  deadline: bigint
  nonce: `0x${string}`
}

// Empty referral data for when no referral is used
export const EMPTY_REFERRAL_DATA: ReferralData = {
  referrer: '0x0000000000000000000000000000000000000000',
  registrant: '0x0000000000000000000000000000000000000000',
  nameHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  referrerCodeHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  deadline: 0n,
  nonce: '0x0000000000000000000000000000000000000000000000000000000000000000',
}

export const EMPTY_REFERRAL_SIGNATURE = '0x' as `0x${string}`

// Chainlink Price Feed ABI
export const PriceAbi = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { internalType: 'uint80', name: 'roundId', type: 'uint80' },
      { internalType: 'int256', name: 'answer', type: 'int256' },
      { internalType: 'uint256', name: 'startedAt', type: 'uint256' },
      { internalType: 'uint256', name: 'updatedAt', type: 'uint256' },
      { internalType: 'uint80', name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
]

// Resolver setAddr ABI
export const addrResolver = [
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
