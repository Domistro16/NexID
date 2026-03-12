// NexID v2 Constants - Base Chain
// Contract addresses (placeholders - update after deployment)

export interface ContractAddresses {
  Controller: `0x${string}`
  PriceOracle: `0x${string}`
  Registry: `0x${string}`
  ReverseRegistrar: `0x${string}`
  BaseRegistrar: `0x${string}`
  NameWrapper: `0x${string}`
  PublicResolver: `0x${string}`
  Referral: `0x${string}`
  PremiumRegistry: `0x${string}`
  Auction: `0x${string}`
  USDC: `0x${string}`
  BulkRenewal: `0x${string}`
  Course: `0x${string}`
  // V2 Account Abstraction
  AccountFactory: `0x${string}`
  EntryPoint: `0x${string}`
  CirclePaymaster: `0x${string}`
}

export const CONSTANTS_MAINNET: ContractAddresses = {
  // AgentRegistrarController - main registration entry point
  Controller: '0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494',

  // AgentPriceOracle - pricing with agent name detection
  PriceOracle: '0x15E2ccAeb4D1eeA1A7b8d839FFA30D63519D1c50',

  // ENS Registry
  Registry: '0xA590B208e7F2e62a3987424D2E1b00cd62986fAd',

  // Reverse Registrar
  ReverseRegistrar: '0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA',

  // Base Registrar
  BaseRegistrar: '0xCAfd2aCA95B79Ce2De0047F2309FCaB33Da75E9C',

  // Name Wrapper
  NameWrapper: '0x90d848F20589437EF2e05a91130aEEA253512736',

  // AgentPublicResolver - with x402/ERC-8004 support
  PublicResolver: '0x0a8C0f71C3Ec3FC8cB59F27885eb52C033780b6f',

  // Referral Verifier
  Referral: '0x212c27756529679efBd46cb35440b2e4DC28e33C',

  // v2 Premium Auctions
  // PremiumNameRegistry - tracks premium/reserved names
  PremiumRegistry: '0xd88dfd4E3B9a14C66E40bD931eCA713192DD2Dba',

  // IDDomainAuction - English auction system for premium names
  Auction: '0x7589b51FF60cf40046ec05247a68Eae397E37d30',

  // USDC on Base
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',

  // Backward compatibility - BulkRenewal
  BulkRenewal: '0xeCE5eA613C203f5235c736c139bde431D23738eA',

  // Backward compatibility - Course contract
  Course: '0x0000000000000000000000000000000000000000',

  // V2 Account Abstraction
  AccountFactory: '0x594D8baAc764A91113E5AAC91DAcFDf9eeF066C8',
  EntryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', // EntryPoint v0.7
  CirclePaymaster: '0x6C973eBe80dCD8660841D4356bf15c32460271C9', // Circle Paymaster (Base Mainnet)
}

export const CONSTANTS_TESTNET: ContractAddresses = {
  // Base Sepolia Addresses (from deployments/baseSepolia)
  Controller: '0x64E86C4F19FC37Fe6c662F83dd4EB932bA601DC2', // AgentRegistrarController
  PriceOracle: '0x6fB7F1F4F8Cbe1cb9C33d60742B1B5036505eBcb', // AgentPriceOracle
  Registry: '0x60b5c974D939C56A0b02EAaC197F57e0B3cf937b', // ENSRegistry
  ReverseRegistrar: '0x6516d242117CE3Be817aeBF39e7e3A044F62D81C',
  BaseRegistrar: '0x0Ba17Ee6c8d745F5bDB710Fead7d85ceE17E5622', // BaseRegistrarImplementation
  NameWrapper: '0x1A7EB9815b6B1014A542CE0628D8FC65Bc5Cb653',
  PublicResolver: '0x82fAa0d80dFFeFadF962C5f2DDBFeE92ABF500C5', // AgentPublicResolver
  Referral: '0x43D667D367A48368Ee6CA072cD96b09a19Ee342b', // ReferralVerifier
  PremiumRegistry: '0x7AFc4332ECd5F15fDF7c6Cd6BD7b6E4F316C10a0', // PremiumNameRegistry
  Auction: '0x8260188708e1f2aa225420F3bE3AcB5D7890e609', // IDDomainAuction
  // USDC on Base Sepolia
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  BulkRenewal: '0x43A39a38e585f4894cdAb12a602b5F15495a65c0', // StaticBulkRenewal
  Course: '0x0000000000000000000000000000000000000000',

  // V2 Account Abstraction
  AccountFactory: '0x860B78482d7ee00c53ae53A48d6577Cde0fdA230', // AgentAccountFactory
  EntryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', // EntryPoint v0.7
  CirclePaymaster: '0x31BE08D380A21fc740883c0BC434FcFc88740b58', // Circle Paymaster (Base Sepolia)
}

export const ADDRESSES: Record<number, ContractAddresses> = {
  8453: CONSTANTS_MAINNET,
  84532: CONSTANTS_TESTNET,
}

// Default to Base Mainnet
export const constants = CONSTANTS_MAINNET

// Chain Configuration
export const CHAIN_ID = 8453 // Default / Fallback
export const TESTNET_CHAIN_ID = 84532

export const getConstants = (chainId?: number): ContractAddresses => {
  return ADDRESSES[chainId || CHAIN_ID] || CONSTANTS_MAINNET
}

// Top-level domain
export const TLD = 'id'

// Registration is always lifetime in v2
export interface RegisterParams {
  /** The name to register (without TLD) */
  name: string

  /** Owner address */
  owner: `0x${string}`

  /** Resolver contract address */
  resolver: `0x${string}`

  /** Array of ABI-encoded data blobs for text records */
  data: `0x${string}`[]

  /** Whether to set up a reverse record */
  reverseRecord: boolean

  /** Owner-controlled fuses bitmap */
  ownerControlledFuses: number
}
