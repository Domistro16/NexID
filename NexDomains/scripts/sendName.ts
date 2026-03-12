import hre from 'hardhat'
import { namehash } from 'viem/ens'
import { normalize } from 'viem/ens'
async function main() {
  const { viem } = hre
  const { deployer } = await hre.viem.getNamedClients()
  const wrapper = await viem.getContract('NameWrapper')
  const base = await viem.getContract('BaseRegistrarImplementation')
  const registry = await viem.getContract('ENSRegistry')

  const DOMAIN_NAMES = ['nadya']

  for (const name of DOMAIN_NAMES) {
    const label = normalize(name)
    const node = namehash(`${label}.id`)
    const wrapped = await wrapper.read.isWrapped([node])
    console.log(wrapped)
    console.log('Resolver set for', label)
    if (wrapped) {
      const sendHash = await wrapper.write.safeTransferFrom([
       '0xd83defba240568040b39bb2c8b4db7db02d40593',
        '0xc8111c2689d866A88291811cb5b0B31665F08350',
        BigInt(node),
        1n,
        '0x',
      ])

      await viem.waitForTransactionSuccess(sendHash)
      console.log('Wrapped name sent:', label)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
