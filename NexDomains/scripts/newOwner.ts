import { labelhash } from 'viem/ens'
import hre from 'hardhat'
async function main() {
  const { viem } = hre
  const { deployer, owner } = await viem.getNamedClients()

  // ─── CONFIGURE THESE ────────────────────────────────────────────────────────
  const root = await viem.getContract('Root', owner)

  const setReverseOwnerHash = await root.write.setSubnodeOwner(
    [labelhash('reverse'), '0x86382b58ca8D0b3064207851950e719332E5F610'],
    { account: owner.account },
  )

  console.log(
    `Setting owner of .reverse to owner on root (tx: ${setReverseOwnerHash})...`,
  )

  const ownerIsRootController = await root.read.controllers([
    '0x86382b58ca8D0b3064207851950e719332E5F610',
  ])
  if (!ownerIsRootController) {
    const setControllerHash = await root.write.setController(
      ['0x86382b58ca8D0b3064207851950e719332E5F610', true],
      { account: owner.account },
    )
    console.log(
      `Setting final owner as controller on root contract (tx: ${setControllerHash})...`,
    )
    await viem.waitForTransactionSuccess(setControllerHash)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
