import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@nomicfoundation/hardhat-verify'
import "dotenv/config"

const { API_URL, PRIVATE_KEY, BASE_RPC_URL, BASE_SEPOLIA_RPC_URL } = process.env

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.28',
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
    ],
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {},
    ...(API_URL && PRIVATE_KEY ? {
      bsc: {
        url: API_URL,
        chainId: 56,
        accounts: [PRIVATE_KEY],
      },
      bscTestnet: {
        url: API_URL,
        chainId: 97,
        accounts: [PRIVATE_KEY],
      },
    } : {}),
    base: {
      url: BASE_RPC_URL || 'https://mainnet.base.org',
      chainId: 8453,
      accounts: PRIVATE_KEY ? [`${PRIVATE_KEY}`] : [],
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
      chainId: 84532,
      accounts: PRIVATE_KEY ? [`${PRIVATE_KEY}`] : [],
    },
  },
  etherscan: {
    apiKey: {
      bsc: process.env.API_KEY || '',
      bscTestnet: process.env.API_KEY || '',
      base: process.env.BASESCAN_API_KEY || '',
      baseSepolia: process.env.BASESCAN_API_KEY || '',
    },
    customChains: [
      {
        network: 'base',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org',
        },
      },
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
    ],
  },
  
  sourcify: {
    // Disabled by default
    // Doesn't need an API key
    enabled: true,
  },
}

export default config
