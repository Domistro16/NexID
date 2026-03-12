import type { DeployFunction } from 'hardhat-deploy/types.js'
import { namehash, zeroAddress } from 'viem'
import { createInterfaceId } from '../../test/fixtures/createInterfaceId.js'
import { createNonceWaiter } from '../../deploy-utils/waitForNonce.js'

const func: DeployFunction = async function (hre) {
  const { deployments, network, viem } = hre
  const waitNonce = createNonceWaiter(viem)

  const { deployer, owner } = await viem.getNamedClients()

  const registry = await viem.getContract('ENSRegistry', owner)

  // Token addresses per network - only used on non-test networks
  let tokenAddresses: { token: string; tokenAddress: string }[] = []

  if (!network.tags.test) {
    if (network.name === 'bsc') {
      // BSC mainnet tokens
      tokenAddresses = [
        {
          token: 'cake',
          tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
        },
        {
          token: 'usd1',
          tokenAddress: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d',
        },
      ]
    }
    // Base mainnet: no additional tokens (uses USDC via AgentRegistrarController)
  }

  const registrar = await viem.getContract('BaseRegistrarImplementation', owner)
  const priceOracle = await viem.getContract('TokenPriceOracle', owner)
  const reverseRegistrar = await viem.getContract('ReverseRegistrar', owner)
  const nameWrapper = await viem.getContract('NameWrapper', owner)

  // ReferralVerifier
  const referralVerifier = await viem.getContract('ReferralVerifier', owner)

  const controllerDeployment = await viem.deploy('ETHRegistrarController', [
    registrar.address,
    priceOracle.address,
    60n,
    86400n,
    reverseRegistrar.address,
    nameWrapper.address,
    registry.address,
    referralVerifier.address,
  ])
  if (!controllerDeployment.newlyDeployed) return

  const controller = await viem.getContract('ETHRegistrarController')

  const refferal = await viem.getContract('ReferralVerifier')

  if (owner.address !== deployer.address) {
    const hash = await controller.write.transferOwnership([owner.address])
    console.log(
      `Transferring ownership of ETHRegistrarController to ${owner.address} (tx: ${hash})...`,
    )
    await waitNonce(hash)

    // Verify ownership is propagated on the RPC before proceeding.
    for (let i = 0; i < 15; i++) {
      const currentOwner = await controller.read.owner()
      if (currentOwner.toLowerCase() === owner.address.toLowerCase()) break
      console.log(
        `Waiting for ETHRegistrarController ownership to propagate (attempt ${i + 1})...`,
      )
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  for (const token of tokenAddresses) {
    const hash = await controller.write.setToken([token.token, token.tokenAddress])
    console.log(`Adding ${token.token} to ETHRegistrarController (tx: ${hash})`)
    await waitNonce(hash)
  }

  // Only attempt to make controller etc changes directly on testnets
  if (network.name === 'mainnet') return
  const backendHash = await controller.write.setBackend([owner.address])
  console.log(`Adding backend (tx: ${backendHash})...`)
  await waitNonce(backendHash)
  const nameWrapperSetControllerHash = await nameWrapper.write.setController([
    controller.address,
    true,
  ])
  console.log(
    `Adding ETHRegistrarController as a controller of NameWrapper (tx: ${nameWrapperSetControllerHash})...`,
  )
  await waitNonce(nameWrapperSetControllerHash)

  const reverseRegistrarSetControllerHash =
    await reverseRegistrar.write.setController([controller.address, true])
  console.log(
    `Adding ETHRegistrarController as a controller of ReverseRegistrar (tx: ${reverseRegistrarSetControllerHash})...`,
  )
  await waitNonce(reverseRegistrarSetControllerHash)

  const artifact = await deployments.getArtifact('IETHRegistrarController')
  const interfaceId = createInterfaceId(artifact.abi)

  const resolver = await registry.read.resolver([namehash('id')])
  if (resolver === zeroAddress) {
    console.log(
      `No resolver set for .id; not setting interface ${interfaceId} for id Registrar Controller`,
    )
    return
  }

  const ethOwnedResolver = await viem.getContract('OwnedResolver')
  const setInterfaceHash = await ethOwnedResolver.write.setInterface([
    namehash('id'),
    interfaceId,
    controller.address,
  ])
  console.log(
    `Setting ETHRegistrarController interface ID ${interfaceId} on .id resolver (tx: ${setInterfaceHash})...`,
  )
  await viem.waitForTransactionSuccess(setInterfaceHash)
}

func.tags = ['ethregistrar', 'ETHRegistrarController']
func.dependencies = [
  'ENSRegistry',
  'BaseRegistrarImplementation',
  'TokenPriceOracle',
  'ReverseRegistrar',
  'NameWrapper',
  'OwnedResolver',
  'agent-registrar-controller',
]

export default func
