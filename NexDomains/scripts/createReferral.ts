import hre from 'hardhat'
import { keccak256, namehash, toHex } from 'viem'
const main = async () => {
  const { viem } = hre
  const { owner } = await viem.getNamedClients()
  const referral = await viem.getContract('ReferralController')
  const base = await viem.getContract('BaseRegistrarImplementation')

  const labelhash = namehash('domistro')
  const expires = await base.read.nameExpires([BigInt(labelhash)])
  if (!expires) return
  console.log(expires)

  const hash2 = await referral.write.setReferree([
    labelhash,
    owner.address,
    expires,
  ])
  await viem.waitForTransactionSuccess(hash2)
  console.log(hash2)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
