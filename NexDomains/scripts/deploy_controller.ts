import { namehash, zeroAddress } from 'viem'
import { createInterfaceId } from '../test/fixtures/createInterfaceId.js'
import hre from 'hardhat'
const main = async () => {
  const { deployments, network, viem } = hre

  const { deployer, owner } = await viem.getNamedClients()

  /*  const registry = await viem.getContract('ENSRegistry', owner)
  const tokenAddresses: any[] = [
    {
      token: 'cake',
      tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    },
    {
      token: 'usd1',
      tokenAddress: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d',
    },
  ]
  const registrar = await viem.getContract('BaseRegistrarImplementation', owner)
  const priceOracle = await viem.getContract('TokenPriceOracle', owner)
  const reverseRegistrar = await viem.getContract('ReverseRegistrar', owner)
  const nameWrapper = await viem.getContract('NameWrapper', owner)

  const refferal = await viem.getContract('ReferralController', owner) */
  await viem.deploy('Airdrop', [])

  /*  const controllerDeployment = await viem.deploy('ETHRegistrarController', [
    registrar.address,
    priceOracle.address,
    60n,
    86400n,
    reverseRegistrar.address,
    nameWrapper.address,
    registry.address,
    refferal.address,
  ])
  if (!controllerDeployment.newlyDeployed) return
  */
  const controller = await viem.getContract('ETHRegistrarController', owner)

  const airdropHash = await controller.write.controlAirdrop([false])

  await viem.waitForTransactionSuccess(airdropHash)

  /*  if (owner.address !== deployer.address) {
    const hash = await controller.write.transferOwnership([owner.address])
    console.log(
      `Transferring ownership of ETHRegistrarController to ${owner.address} (tx: ${hash})...`,
    )
    await viem.waitForTransactionSuccess(hash)
  } */
  const airdrop = await viem.getContract('Airdrop')

  const anohash = await airdrop.write.setController([controller.address])
  await viem.waitForTransactionSuccess(anohash)
  /*   for (const tokenAddress of tokenAddresses) {
    const hash = await controller.write.setToken([
      tokenAddress,
      tokenAddress.tokenAddress,
    ])
    console.log(`Adding ${tokenAddress} to ETHRegistrarController`)
    await viem.waitForTransactionSuccess(hash)
  } */
  /* 
  // Only attempt to make controller etc changes directly on testnets
  if (network.name === 'mainnet') return

  const referralControllerHash = await refferal.write.addController([
    controller.address,
  ])
  console.log(
    `Adding controller as a controller of Referral (tx: ${referralControllerHash})...`,
  )
  await viem.waitForTransactionSuccess(referralControllerHash)
  const backendHash = await controller.write.setBackend([owner.address])
  console.log(`Adding backend (tx: ${backendHash})...`)
  await viem.waitForTransactionSuccess(backendHash)
  const nameWrapperSetControllerHash = await nameWrapper.write.setController([
    controller.address,
    true,
  ])
  console.log(
    `Adding ETHRegistrarController as a controller of NameWrapper (tx: ${nameWrapperSetControllerHash})...`,
  )
  await viem.waitForTransactionSuccess(nameWrapperSetControllerHash)

  const reverseRegistrarSetControllerHash =
    await reverseRegistrar.write.setController([controller.address, true])
  console.log(
    `Adding ETHRegistrarController as a controller of ReverseRegistrar (tx: ${reverseRegistrarSetControllerHash})...`,
  )
  await viem.waitForTransactionSuccess(reverseRegistrarSetControllerHash)

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
  await viem.waitForTransactionSuccess(setInterfaceHash)  */
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
