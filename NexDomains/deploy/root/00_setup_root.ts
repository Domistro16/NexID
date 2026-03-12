import type { DeployFunction } from 'hardhat-deploy/types'
import { zeroHash } from 'viem'
import { createNonceWaiter } from '../../deploy-utils/waitForNonce.js'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre
  const waitNonce = createNonceWaiter(viem)

  const { deployer, owner } = await viem.getNamedClients()

  if (!network.tags.use_root) {
    return true
  }

  console.log('Running root setup')

  const registry = await viem.getContract('ENSRegistry')
  const root = await viem.getContract('Root')

  const setOwnerHash = await registry.write.setOwner([zeroHash, root.address])
  console.log(
    `Setting owner of root node to root contract (tx: ${setOwnerHash})...`,
  )
  await waitNonce(setOwnerHash)

  const rootOwner = await root.read.owner()

  switch (rootOwner) {
    case deployer.address:
      const transferOwnershipHash = await root.write.transferOwnership([
        owner.address,
      ])
      console.log(
        `Transferring root ownership to final owner (tx: ${transferOwnershipHash})...`,
      )
      await waitNonce(transferOwnershipHash)

      // Verify ownership is propagated on the RPC before proceeding.
      for (let i = 0; i < 15; i++) {
        const currentOwner = await root.read.owner()
        if (currentOwner.toLowerCase() === owner.address.toLowerCase()) break
        console.log(
          `Waiting for root ownership to propagate (attempt ${i + 1})...`,
        )
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    case owner.address:
      const ownerIsRootController = await root.read.controllers([owner.address])
      if (!ownerIsRootController) {
        const setControllerHash = await root.write.setController(
          [owner.address, true],
          { account: owner.account },
        )
        console.log(
          `Setting final owner as controller on root contract (tx: ${setControllerHash})...`,
        )
        await waitNonce(setControllerHash)
      }
      break
    default:
      console.log(
        `WARNING: Root is owned by ${rootOwner}; cannot transfer to owner account`,
      )
  }

  return true
}

func.id = 'setupRoot'
func.tags = ['setupRoot']
func.dependencies = ['Root']

export default func
