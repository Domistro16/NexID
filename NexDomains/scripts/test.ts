import hre from 'hardhat'
import { defineChain } from 'viem'

export const plasmaTestnet = /*#__PURE__*/ defineChain({
  id: 9746,
  name: 'Plasma Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Plasma',
    symbol: 'XPL',
  },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.plasma.to'] },
  },
  blockExplorers: {
    default: {
      name: 'PlasmaScan',
      url: 'https://testnet.plasmascan.to/',
    },
  },
  testnet: true,
})

async function main() {
  const { viem } = hre
  const client = await viem.getPublicClient({ chain: plasmaTestnet })
  const price = await client.getGasPrice()
  console.log('Current gas price:', price.toString())
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
