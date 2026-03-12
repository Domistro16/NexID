import type { DeployFunction } from 'hardhat-deploy/types'
import { labelhash, namehash } from 'viem'
import { createNonceWaiter } from '../../deploy-utils/waitForNonce.js'

const func: DeployFunction = async function (hre) {
  const { network, viem } = hre
  const waitNonce = createNonceWaiter(viem)

  const { deployer, owner } = await viem.getNamedClients()

  const registry = await viem.getContract('ENSRegistry')

  const reverseRegistrarDeployment = await viem.deploy('ReverseRegistrar', [
    registry.address,
  ])
  // if (!reverseRegistrarDeployment.newlyDeployed) return

  const reverseRegistrar = await viem.getContract('ReverseRegistrar')

  if (owner.address !== deployer.address) {
    const hash = await reverseRegistrar.write.transferOwnership([owner.address])
    console.log(
      `Transferring ownership of ReverseRegistrar to ${owner.address} (tx: ${hash})...`,
    )
    await waitNonce(hash)
  }

  // Only attempt to make controller etc changes directly on testnets
  if (network.name === 'mainnet') return

  const setControllerHash = await reverseRegistrar.write.setController(
    [owner.address, true],
    { account: owner.account },
  )
  console.log(
    `Setting owner as controller on backend (tx: ${setControllerHash})...`,
  )
  await waitNonce(setControllerHash)

  const root = await viem.getContract('Root')

  const setReverseOwnerHash = await root.write.setSubnodeOwner(
    [labelhash('reverse'), owner.address],
    { account: owner.account },
  )
  console.log(
    `Setting owner of .reverse to owner on root (tx: ${setReverseOwnerHash})...`,
  )
  await waitNonce(setReverseOwnerHash)

  // Verify reverse node ownership is propagated on the RPC before proceeding.
  // On L2s like Base Sepolia, eth_call may see stale state after a tx confirms,
  // causing viem's pre-send simulation to revert with authorised() failure.
  // This shows up as "ContractFunctionExecutionError: Missing or invalid parameters"
  // because viem wraps the simulation revert misleadingly.
  const reverseNode = namehash('reverse')
  for (let i = 0; i < 15; i++) {
    const reverseOwner = await registry.read.owner([reverseNode])
    if (reverseOwner.toLowerCase() === owner.address.toLowerCase()) break
    console.log(
      `Waiting for .reverse node ownership to propagate (attempt ${i + 1})...`,
    )
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  const setAddrOwnerHash = await registry.write.setSubnodeOwner(
    [namehash('reverse'), labelhash('addr'), reverseRegistrar.address],
    { account: owner.account },
  )
  console.log(
    `Setting owner of .addr.reverse to ReverseRegistrar on registry (tx: ${setAddrOwnerHash})...`,
  )
  await viem.waitForTransactionSuccess(setAddrOwnerHash)
}

func.id = 'reverse-registrar'
func.tags = ['ReverseRegistrar']
func.dependencies = ['setupRoot']

export default func
