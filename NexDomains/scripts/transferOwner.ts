import { labelhash } from 'viem/ens'
import hre from 'hardhat'
async function main() {
  const { viem } = hre
  const { deployer, owner } = await viem.getNamedClients()

  // ─── CONFIGURE THESE ────────────────────────────────────────────────────────
  const root = await viem.getContract('Root', owner)
  const reverse = await viem.getContract('ReverseRegistrar', owner)
  const base = await viem.getContract('BaseRegistrarImplementation', owner)
  const controller = await viem.getContract('ETHRegistrarController', owner)
  const nameWrapper = await viem.getContract('NameWrapper', owner)
  const referal = await viem.getContract('ReferralController', owner)
  const setReverseOwnerHash = await root.write.setSubnodeOwner(
    [labelhash('reverse'), owner.address],
    { account: owner.account },
  )
  await viem.waitForTransactionSuccess(setReverseOwnerHash)
  console.log(
    `Setting owner of .reverse to owner on root (tx: ${setReverseOwnerHash})...`,
  )
  const hash1 = await root.write.transferOwnership(
    ['0x235799785E387C2612d4A881919436B612ed391D'],
    { account: owner.account },
  )
  console.log(`Transferring root ownership to final owner (tx: ${hash1})...`)
  await viem.waitForTransactionSuccess(hash1)
  const hash2 = await reverse.write.transferOwnership(
    ['0x235799785E387C2612d4A881919436B612ed391D'],
    { account: owner.account },
  )
  console.log(
    `Transferring ownership of ReverseRegistrar to final owner (tx: ${hash2})...`,
  )
  await viem.waitForTransactionSuccess(hash2)
  const hash3 = await base.write.transferOwnership(
    ['0x235799785E387C2612d4A881919436B612ed391D'],
    { account: owner.account },
  )
  console.log(
    `Transferring ownership of BaseRegistrar to final owner (tx: ${hash3})...`,
  )
  await viem.waitForTransactionSuccess(hash3)
  const hash4 = await controller.write.transferOwnership(
    ['0x235799785E387C2612d4A881919436B612ed391D'],
    { account: owner.account },
  )
  console.log(
    `Transferring ownership of ETHRegistrarController to final owner (tx: ${hash4})...`,
  )
  await viem.waitForTransactionSuccess(hash4)
  const hash5 = await nameWrapper.write.transferOwnership(
    ['0x235799785E387C2612d4A881919436B612ed391D'],
    { account: owner.account },
  )
  console.log(
    `Transferring ownership of NameWrapper to final owner (tx: ${hash5})...`,
  )
  await viem.waitForTransactionSuccess(hash5)
  const hash6 = await referal.write.transferOwnership(
    ['0x235799785E387C2612d4A881919436B612ed391D'],
    { account: owner.account },
  )
  console.log(
    `Transferring ownership of ReferralController to final owner (tx: ${hash6})...`,
  )
  await viem.waitForTransactionSuccess(hash6)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
