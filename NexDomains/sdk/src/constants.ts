import type { Address } from 'viem'
import type { ChainConfig } from './types'

/**
 * Contract addresses by chain ID
 */
export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
    // Base Mainnet
    8453: {
        chainId: 8453,
        registrar: '0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494' as Address, // AgentRegistrarController
        priceOracle: '0x15E2ccAeb4D1eeA1A7b8d839FFA30D63519D1c50' as Address, // AgentPriceOracle
        resolver: '0x0a8C0f71C3Ec3FC8cB59F27885eb52C033780b6f' as Address, // AgentPublicResolver
        nameWrapper: '0x90d848F20589437EF2e05a91130aEEA253512736' as Address,
        reverseRegistrar: '0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA' as Address,
        registry: '0xA590B208e7F2e62a3987424D2E1b00cd62986fAd' as Address,
        baseRegistrar: '0xCAfd2aCA95B79Ce2De0047F2309FCaB33Da75E9C' as Address,
        referralVerifier: '0x212c27756529679efBd46cb35440b2e4DC28e33C' as Address,
        premiumRegistry: '0xd88dfd4E3B9a14C66E40bD931eCA713192DD2Dba' as Address,
        auction: '0x7589b51FF60cf40046ec05247a68Eae397E37d30' as Address,
        bulkRenewal: '0xeCE5eA613C203f5235c736c139bde431D23738eA' as Address,
        accountFactory: '0x594D8baAc764A91113E5AAC91DAcFDf9eeF066C8' as Address,
        usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
        entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address, // EntryPoint v0.7
    },
    // Base Sepolia
    84532: {
        chainId: 84532,
        registrar: '0x64E86C4F19FC37Fe6c662F83dd4EB932bA601DC2' as Address, // AgentRegistrarController
        priceOracle: '0x6fB7F1F4F8Cbe1cb9C33d60742B1B5036505eBcb' as Address, // AgentPriceOracle
        resolver: '0x82fAa0d80dFFeFadF962C5f2DDBFeE92ABF500C5' as Address, // AgentPublicResolver
        nameWrapper: '0x1A7EB9815b6B1014A542CE0628D8FC65Bc5Cb653' as Address,
        reverseRegistrar: '0x6516d242117CE3Be817aeBF39e7e3A044F62D81C' as Address,
        registry: '0x60b5c974D939C56A0b02EAaC197F57e0B3cf937b' as Address,
        baseRegistrar: '0x0Ba17Ee6c8d745F5bDB710Fead7d85ceE17E5622' as Address,
        referralVerifier: '0x43D667D367A48368Ee6CA072cD96b09a19Ee342b' as Address,
        premiumRegistry: '0x7AFc4332ECd5F15fDF7c6Cd6BD7b6E4F316C10a0' as Address,
        auction: '0x8260188708e1f2aa225420F3bE3AcB5D7890e609' as Address,
        bulkRenewal: '0x43A39a38e585f4894cdAb12a602b5F15495a65c0' as Address,
        accountFactory: '0x860B78482d7ee00c53ae53A48d6577Cde0fdA230' as Address, // AgentAccountFactory
        usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
        entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address, // EntryPoint v0.7
    }
}

/**
 * Top-level domain for SafuDomains
 */
export const TLD = 'id'

/**
 * Lifetime duration in seconds (100 years)
 */
export const LIFETIME_DURATION = 100n * 365n * 24n * 60n * 60n

/**
 * Default empty referral data
 */
export const EMPTY_REFERRAL_DATA = {
    referrer: '0x0000000000000000000000000000000000000000' as Address,
    registrant: '0x0000000000000000000000000000000000000000' as Address,
    nameHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    referrerCodeHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    deadline: 0n,
    nonce: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
}

/**
 * Empty referral signature
 */
export const EMPTY_REFERRAL_SIGNATURE = '0x' as `0x${string}`
