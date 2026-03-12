import hre from 'hardhat'
import { namehash } from 'viem'
async function main() {
  const { viem } = hre

  const { deployer } = await viem.getNamedClients()

  const reverseRegistrar = await viem.getContract('ReverseRegistrar', deployer)
  const resolver = await viem.getContract('AgentPublicResolver', deployer)
  const setPrimaryNameHash = await reverseRegistrar.write.setNameForAddr([
    '0xc8111c2689d866A88291811cb5b0B31665F08350',
    '0xc8111c2689d866A88291811cb5b0B31665F08350',
    resolver.address,
    'nadya.id',
  ])
  console.log(
    `Setting primary name for ${'0xc8111c2689d866A88291811cb5b0B31665F08350'} to nadya.id (tx: ${setPrimaryNameHash})...`,
  )
  await viem.waitForTransactionSuccess(setPrimaryNameHash)
}

main().then(() => process.exit(0))
