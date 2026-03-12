import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  labelhash,
  namehash,
  zeroAddress,
  zeroHash,
} from 'viem'
import { getInterfaceId } from '../fixtures/createInterfaceId.js'
import { toLabelId } from '../fixtures/utils.js'

async function fixture() {
  const accounts = await hre.viem
    .getWalletClients()
    .then((clients) => clients.map((c) => c.account))
  // Create a registry
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  // Create a base registrar
  const baseRegistrar = await hre.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('id')],
  )

  // Setup reverse registrar
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    accounts[0].address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  // Create a name wrapper
  const nameWrapper = await hre.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    accounts[0].address,
  ])
  // Create a public resolver
  const publicResolver = await hre.viem.deployContract('PublicResolver', [
    ensRegistry.address,
    nameWrapper.address,
    zeroAddress,
    zeroAddress,
  ])

  // Set up a dummy price oracle and a controller
  const dummyOracle = await hre.viem.deployContract('DummyOracle', [100000000n])
  const dummyCakeOracle = await hre.viem.deployContract('DummyOracle', [
    100000000n,
  ])
  const dummyUsd1Oracle = await hre.viem.deployContract('DummyOracle', [
    100000000n,
  ])
  const priceOracle = await hre.viem.deployContract('TokenPriceOracle', [
    dummyOracle.address,
    dummyCakeOracle.address,
    dummyUsd1Oracle.address,
    [0n, 0n, 4n, 2n, 1n],
    100000000000000000000000000n,
    21n,
  ])
  const referralVerifier = await hre.viem.deployContract(
    'ReferralVerifier',
    [
      accounts[0].address, // signer
      nameWrapper.address,
      baseRegistrar.address,
    ],
  )
  const controller = await hre.viem.deployContract('ETHRegistrarController', [
    baseRegistrar.address,
    priceOracle.address,
    600n,
    86400n,
    zeroAddress,
    nameWrapper.address,
    ensRegistry.address,
    referralVerifier.address,
  ])

  await baseRegistrar.write.addController([controller.address])
  await baseRegistrar.write.addController([accounts[0].address])
  await baseRegistrar.write.addController([nameWrapper.address])
  await nameWrapper.write.setController([controller.address, true])
  // Add ETHRegistrarController as controller on ReferralVerifier
  await referralVerifier.write.setController([controller.address, true])

  // Create the bulk renewal contract
  const bulkRenewal = await hre.viem.deployContract('BulkRenewal', [
    ensRegistry.address,
  ])

  // Configure a resolver for .id and register the controller interface
  // then transfer the .id node to the base registrar.
  await ensRegistry.write.setSubnodeRecord([
    zeroHash,
    labelhash('id'),
    accounts[0].address,
    publicResolver.address,
    0n,
  ])
  const interfaceId = await getInterfaceId('IETHRegistrarController')
  await publicResolver.write.setInterface([
    namehash('id'),
    interfaceId,
    controller.address,
  ])
  await ensRegistry.write.setOwner([namehash('id'), baseRegistrar.address])

  // Register some names
  for (const name of ['test1', 'test2', 'test3']) {
    await baseRegistrar.write.register([
      toLabelId(name),
      accounts[1].address,
      31536000n,
    ])
  }

  return { ensRegistry, baseRegistrar, bulkRenewal, accounts }
}

// Minimum registration duration is 28 days
const MIN_DURATION = 28n * 24n * 60n * 60n // 2419200 seconds

describe('BulkRenewal', () => {
  it('should return the cost of a bulk renewal', async () => {
    const { bulkRenewal } = await loadFixture(fixture)

    await expect(
      bulkRenewal.read.rentPrice([['test1', 'test2'], MIN_DURATION, false]),
    ).resolves.toEqual(MIN_DURATION * 2n)
  })

  it('should raise an error trying to renew a nonexistent name', async () => {
    const { bulkRenewal } = await loadFixture(fixture)

    await expect(bulkRenewal)
      .write('renewAll', [['foobar'], MIN_DURATION, false])
      .toBeRevertedWithoutReason()
  })

  it('should permit bulk renewal of names', async () => {
    const { baseRegistrar, bulkRenewal } = await loadFixture(fixture)
    const publicClient = await hre.viem.getPublicClient()

    const oldExpiry = await baseRegistrar.read.nameExpires([toLabelId('test2')])

    await bulkRenewal.write.renewAll([['test1', 'test2'], MIN_DURATION, false], {
      value: MIN_DURATION * 2n,
    })

    const newExpiry = await baseRegistrar.read.nameExpires([toLabelId('test2')])

    expect(newExpiry - oldExpiry).toBe(MIN_DURATION)

    // Check any excess funds are returned
    await expect(
      publicClient.getBalance({ address: bulkRenewal.address }),
    ).resolves.toEqual(0n)
  })
})
