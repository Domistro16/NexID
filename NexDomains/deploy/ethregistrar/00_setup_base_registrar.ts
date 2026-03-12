import type { DeployFunction } from 'hardhat-deploy/types'
import { labelhash } from 'viem'
import { createNonceWaiter } from '../../deploy-utils/waitForNonce.js'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre
  const waitNonce = createNonceWaiter(viem)

  const { deployer, owner } = await viem.getNamedClients()

  if (!network.tags.use_root) {
    return true
  }

  const root = await viem.getContract('Root')
  const registrar = await viem.getContract('BaseRegistrarImplementation')

  console.log('Running base registrar setup')

  const transferOwnershipHash = await registrar.write.transferOwnership(
    [owner.address],
    { account: deployer.account },
  )
  console.log(
    `Transferring ownership of registrar to owner (tx: ${transferOwnershipHash})...`,
  )
  await waitNonce(transferOwnershipHash)

  const setSubnodeOwnerHash = await root.write.setSubnodeOwner(
    [labelhash('id'), registrar.address],
    {
      account: owner.account,
    },
  )
  console.log(
    `Setting owner of id node to registrar on root (tx: ${setSubnodeOwnerHash})...`,
  )
  await viem.waitForTransactionSuccess(setSubnodeOwnerHash)
}

func.id = 'setupRegistrar'
func.tags = ['setupRegistrar']
//Runs after the root is setup
func.dependencies = ['setupRoot']

export default func
