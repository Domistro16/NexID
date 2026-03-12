// scripts/estimate-deploy.ts
import hre from 'hardhat'
import {
  createPublicClient,
  encodeDeployData,
  formatUnits,
  http,
} from 'viem'
import { namehash } from 'viem/ens'
import ENSRegistryArtifact from '../artifacts/contracts/registry/ENSRegistry.sol/ENSRegistry.json'
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
  // 1) get public client for the selected hardhat --network
  const publicClient = createPublicClient({
    chain: plasmaTestnet,
    transport: http(plasmaTestnet.rpcUrls.default.http[0]),
  })
  const artifact = hre.artifacts.readArtifactSync('BaseRegistrarImplementation')
  console.log('Using artifact:', artifact.sourceName, artifact.contractName)
  const { bytecode, abi } = artifact

  const ensRegistry = '0xEb3Bc473bdbbEa428503fc5fE77aA468896e5840'
  // 3) build the constructor args exactly like you will pass to deploy

  // 4) encode deploy data (bytecode + constructor args)
  const data = encodeDeployData({
    abi,
    bytecode: bytecode as `0x${string}`,
    args: [ensRegistry, namehash('plasma')],
  })

  // 5) estimate gas units (this is the number you multiply by gasPrice)
  const estimatedGas = await publicClient.estimateGas({
    data,
    // optional: from: your deployer address so estimate can be more accurate
    account: '0x2A0D7311fA7e9aC2890CFd8219b2dEf0c206E79B' as `0x${string}`,
  })

  console.log('estimated gas units:', estimatedGas.toString())
  // if you want a rough cost estimate in native token, get gas price and multiply:
  const suggestedGasPrice = await publicClient.getGasPrice()
  const feeWei = estimatedGas * suggestedGasPrice
  console.log('approx fee (native wei):', feeWei.toString())
  console.log('approx fee (native):', formatUnits(feeWei, 18)) // human readable
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
