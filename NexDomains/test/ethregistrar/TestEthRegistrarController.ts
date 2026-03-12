import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  Address,
  encodeFunctionData,
  hexToBigInt,
  labelhash,
  namehash,
  zeroAddress,
  zeroHash,
} from 'viem'
import { DAY, FUSES } from '../fixtures/constants.js'
import { getReverseNode } from '../fixtures/getReverseNode.js'
import {
  commitName,
  getDefaultRegistrationOptions,
  getRegisterNameParameterArray,
  getRegisterRequest,
  registerName,
} from '../fixtures/registerName.js'

// Empty referral data for tests without referrals
const EMPTY_REFERRAL_DATA = {
  referrer: zeroAddress,
  registrant: zeroAddress,
  nameHash: zeroHash,
  referrerCodeHash: zeroHash,
  deadline: 0n,
  nonce: zeroHash,
} as const

const EMPTY_REFERRAL_SIGNATURE = '0x' as `0x${string}`

const REGISTRATION_TIME = 28n * DAY
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3n * DAY
const GRACE_PERIOD = 30n * DAY // Must match NameWrapper's GRACE_PERIOD (30 days)

const getAccounts = async () => {
  const [ownerClient, registrantClient, otherClient] =
    await hre.viem.getWalletClients()
  return {
    ownerAccount: ownerClient.account,
    ownerClient,
    registrantAccount: registrantClient.account,
    registrantClient,
    otherAccount: otherClient.account,
    otherClient,
  }
}

const labelId = (label: string) => hexToBigInt(labelhash(label))

async function fixture() {
  const publicClient = await hre.viem.getPublicClient()
  const accounts = await getAccounts()
  const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
  const baseRegistrar = await hre.viem.deployContract(
    'BaseRegistrarImplementation',
    [ensRegistry.address, namehash('id')],
  )
  const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
    ensRegistry.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('reverse'),
    accounts.ownerAccount.address,
  ])
  await ensRegistry.write.setSubnodeOwner([
    namehash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
  ])

  const nameWrapper = await hre.viem.deployContract('NameWrapper', [
    ensRegistry.address,
    baseRegistrar.address,
    accounts.ownerAccount.address,
  ])

  await ensRegistry.write.setSubnodeOwner([
    zeroHash,
    labelhash('id'),
    baseRegistrar.address,
  ])

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
      accounts.ownerAccount.address, // signer
      nameWrapper.address,
      baseRegistrar.address,
    ],
  )
  const ethRegistrarController = await hre.viem.deployContract(
    'ETHRegistrarController',
    [
      baseRegistrar.address,
      priceOracle.address,
      600n,
      86400n,
      reverseRegistrar.address,
      nameWrapper.address,
      ensRegistry.address,
      referralVerifier.address,
    ],
  )

  await nameWrapper.write.setController([ethRegistrarController.address, true])
  await baseRegistrar.write.addController([nameWrapper.address])
  await reverseRegistrar.write.setController([
    ethRegistrarController.address,
    true,
  ])
  // Add ETHRegistrarController as controller on ReferralVerifier
  await referralVerifier.write.setController([
    ethRegistrarController.address,
    true,
  ])

  const publicResolver = await hre.viem.deployContract('PublicResolver', [
    ensRegistry.address,
    nameWrapper.address,
    ethRegistrarController.address,
    reverseRegistrar.address,
  ])

  const callData = [
    encodeFunctionData({
      abi: publicResolver.abi,
      functionName: 'setAddr',
      args: [
        namehash('newconfigname.id'),
        accounts.registrantAccount.address,
      ],
    }),
    encodeFunctionData({
      abi: publicResolver.abi,
      functionName: 'setText',
      args: [namehash('newconfigname.id'), 'url', 'ethereum.com'],
    }),
  ]

  return {
    ensRegistry,
    baseRegistrar,
    reverseRegistrar,
    nameWrapper,
    dummyOracle,
    dummyCakeOracle,
    dummyUsd1Oracle,
    priceOracle,
    referralVerifier,
    ethRegistrarController,
    publicResolver,
    callData,
    publicClient,
    ...accounts,
  }
}

describe('ETHRegistrarController', () => {
  it('should report label validity', async () => {
    // Contract requires strlen() >= 2 for valid labels
    const checkLabels = {
      testing: true,
      longname12345678: true,
      sixsix: true,
      five5: true,
      four: true,
      iii: true,
      ii: true, // 2 chars - valid
      i: false, // 1 char - invalid
      '': false,

      // { ni } { hao } { ma } (chinese; simplified) - 3 chars
      你好吗: true,

      // { ta } { ko } (japanese; hiragana) - 2 chars - valid
      たこ: true,

      // { poop } { poop } { poop } (emoji) - 3 chars
      '\ud83d\udca9\ud83d\udca9\ud83d\udca9': true,

      // { poop } { poop } (emoji) - 2 chars - valid
      '\ud83d\udca9\ud83d\udca9': true,
    }

    const { ethRegistrarController } = await loadFixture(fixture)

    for (const label in checkLabels) {
      await expect(ethRegistrarController.read.valid([label])).resolves.toEqual(
        checkLabels[label as keyof typeof checkLabels],
      )
    }
  })

  it('should report unused names as available', async () => {
    const { ethRegistrarController } = await loadFixture(fixture)
    await expect(
      ethRegistrarController.read.available(['available']),
    ).resolves.toEqual(true)
  })

  it('should permit new registrations', async () => {
    const { ethRegistrarController, publicClient, registrantAccount } =
      await loadFixture(fixture)

    const balanceBefore = await publicClient.getBalance({
      address: ethRegistrarController.address,
    })

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    // Get actual price from controller
    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], {
        value,
      })
      .toEmitEvent('NameRegistered')
      .withArgs(
        params.label,
        labelhash(params.label),
        params.ownerAddress,
        params.duration,
        0n,
        timestamp + params.duration,
      )

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(value + balanceBefore)
  })

  it('should revert when not enough ether is transferred', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture(
      fixture,
    )

    const { request } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], { value: 0n })
      .toBeRevertedWithCustomError('InsufficientValue')
  })

  it('should report registered names as unavailable', async () => {
    const { ethRegistrarController } = await loadFixture(fixture)
    await registerName({ ethRegistrarController }, { label: 'newname' })
    await expect(
      ethRegistrarController.read.available(['newname']),
    ).resolves.toEqual(false)
  })

  it('should permit new registrations with resolver and records', async () => {
    const {
      ensRegistry,
      baseRegistrar,
      nameWrapper,
      ethRegistrarController,
      callData,
      publicResolver,
      publicClient,
      registrantAccount,
    } = await loadFixture(fixture)

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newconfigname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        data: callData,
      },
    )
    const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    // Get actual price from controller
    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], { value })
      .toEmitEvent('NameRegistered')
      .withArgs(
        params.label,
        labelhash(params.label),
        params.ownerAddress,
        params.duration,
        0n,
        timestamp + params.duration,
      )

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(value)

    const nodehash = namehash('newconfigname.id')
    await expect(ensRegistry.read.resolver([nodehash])).resolves.toEqualAddress(
      publicResolver.address,
    )
    await expect(ensRegistry.read.owner([nodehash])).resolves.toEqualAddress(
      nameWrapper.address,
    )
    await expect(
      baseRegistrar.read.ownerOf([labelId('newconfigname')]),
    ).resolves.toEqualAddress(nameWrapper.address)
    await expect(
      publicResolver.read.addr([nodehash]) as Promise<Address>,
    ).resolves.toEqualAddress(registrantAccount.address)
    await expect(publicResolver.read.text([nodehash, 'url'])).resolves.toEqual(
      'ethereum.com',
    )
    await expect(
      nameWrapper.read.ownerOf([hexToBigInt(nodehash)]),
    ).resolves.toEqualAddress(registrantAccount.address)
  })

  it('should not permit new registrations with data and 0 resolver', async () => {
    const { ethRegistrarController, registrantAccount, callData } =
      await loadFixture(fixture)

    const params = await getDefaultRegistrationOptions({
      label: 'newconfigname',
      ownerAddress: registrantAccount.address,
      data: callData,
    })
    const request = getRegisterRequest({
      label: params.label,
      ownerAddress: params.ownerAddress,
      duration: params.duration,
      secret: params.secret as `0x${string}`,
      resolverAddress: params.resolverAddress,
      data: params.data,
      shouldSetReverseRecord: params.shouldSetReverseRecord,
      ownerControlledFuses: params.ownerControlledFuses,
      lifetime: params.lifetime,
    })

    await expect(ethRegistrarController)
      .read('makeCommitment', [request])
      .toBeRevertedWithCustomError('ResolverRequiredWhenDataSupplied')
  })

  it('should not permit new registrations with EoA resolver', async () => {
    const { ethRegistrarController, registrantAccount, callData } =
      await loadFixture(fixture)

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newconfigname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: registrantAccount.address,
        data: callData,
      },
    )

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], { value })
      .toBeRevertedWithoutReason()
  })

  it('should not permit new registrations with incompatible contract resolver', async () => {
    const { ethRegistrarController, registrantAccount, callData } =
      await loadFixture(fixture)

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newconfigname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: ethRegistrarController.address,
        data: callData,
      },
    )

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], { value })
      .toBeRevertedWithoutReason()
  })

  it('should not permit new registrations with records updating a different name', async () => {
    const { ethRegistrarController, publicResolver, registrantAccount } =
      await loadFixture(fixture)

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'awesome',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        data: [
          encodeFunctionData({
            abi: publicResolver.abi,
            functionName: 'setAddr',
            args: [namehash('othername.id'), registrantAccount.address],
          }),
        ],
      },
    )

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], { value })
      .toBeRevertedWithString(
        'multicall: All records must have a matching namehash',
      )
  })

  it('should not permit new registrations with any record updating a different name', async () => {
    const { ethRegistrarController, publicResolver, registrantAccount } =
      await loadFixture(fixture)

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'awesome',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        data: [
          encodeFunctionData({
            abi: publicResolver.abi,
            functionName: 'setAddr',
            args: [namehash('awesome.id'), registrantAccount.address],
          }),
          encodeFunctionData({
            abi: publicResolver.abi,
            functionName: 'setText',
            args: [namehash('othername.id'), 'url', 'ethereum.com'],
          }),
        ],
      },
    )

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], { value })
      .toBeRevertedWithString(
        'multicall: All records must have a matching namehash',
      )
  })

  it('should permit a registration with resolver but no records', async () => {
    const {
      ensRegistry,
      ethRegistrarController,
      publicResolver,
      publicClient,
      registrantAccount,
    } = await loadFixture(fixture)

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newconfigname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
      },
    )
    const timestamp = await publicClient.getBlock().then((b) => b.timestamp)

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], { value })
      .toEmitEvent('NameRegistered')
      .withArgs(
        params.label,
        labelhash(params.label),
        params.ownerAddress,
        params.duration,
        0n,
        timestamp + params.duration,
      )

    const nodehash = namehash('newconfigname.id')
    await expect(ensRegistry.read.resolver([nodehash])).resolves.toEqualAddress(
      publicResolver.address,
    )
    await expect<Promise<Address>>(
      publicResolver.read.addr([nodehash]),
    ).resolves.toEqual(zeroAddress)
    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(value)
  })

  it('should include the owner in the commitment', async () => {
    const { ethRegistrarController, registrantAccount, otherAccount } =
      await loadFixture(fixture)

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: otherAccount.address,
      },
    )

    // Create a modified request with a different owner to test commitment verification
    const modifiedRequest = {
      ...request,
      owner: registrantAccount.address,
    }

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [modifiedRequest, referralData, EMPTY_REFERRAL_SIGNATURE], { value })
      .toBeRevertedWithCustomError('CommitmentTooOld')
  })

  it('should reject duplicate registrations', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture(
      fixture,
    )

    const label = 'newname'

    await registerName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], { value })
      .toBeRevertedWithCustomError('NameNotAvailable')
      .withArgs(label)
  })

  it('should reject for expired commitments', async () => {
    const { ethRegistrarController, registrantAccount } = await loadFixture(
      fixture,
    )
    const testClient = await hre.viem.getTestClient()

    const { request, params, hash } = await commitName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const minCommitmentAge =
      await ethRegistrarController.read.minCommitmentAge()
    const maxCommitmentAge =
      await ethRegistrarController.read.maxCommitmentAge()

    await testClient.increaseTime({
      seconds: Number(maxCommitmentAge - minCommitmentAge) + 1,
    })

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], { value })
      .toBeRevertedWithCustomError('CommitmentTooOld')
      .withArgs(hash)
  })

  it('should allow anyone to renew a name and change fuse expiry', async () => {
    const {
      baseRegistrar,
      ethRegistrarController,
      nameWrapper,
      publicClient,
      registrantAccount,
    } = await loadFixture(fixture)
    await registerName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const nodehash = namehash('newname.id')
    const fuseExpiry = await nameWrapper.read
      .getData([hexToBigInt(nodehash)])
      .then((d) => d[2])
    const expires = await baseRegistrar.read.nameExpires([labelId('newname')])
    const balanceBefore = await publicClient.getBalance({
      address: ethRegistrarController.address,
    })

    const duration = REGISTRATION_TIME // Use 28 days to meet MIN_REGISTRATION_DURATION
    const { base: price } = await ethRegistrarController.read.rentPrice([
      'newname',
      duration,
      false,
    ])

    await ethRegistrarController.write.renew(['newname', duration, false], {
      value: price,
    })

    const newExpires = await baseRegistrar.read.nameExpires([
      labelId('newname'),
    ])
    const newFuseExpiry = await nameWrapper.read
      .getData([hexToBigInt(nodehash)])
      .then((d) => d[2])

    expect(newExpires - expires).toEqual(duration)
    expect(newFuseExpiry - fuseExpiry).toEqual(duration)

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(balanceBefore + price)
  })

  it('should allow token owners to renew a name', async () => {
    const {
      baseRegistrar,
      ethRegistrarController,
      nameWrapper,
      publicClient,
      registrantAccount,
    } = await loadFixture(fixture)
    await registerName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    const nodehash = namehash('newname.id')
    const fuseExpiry = await nameWrapper.read
      .getData([hexToBigInt(nodehash)])
      .then((d) => d[2])
    const expires = await baseRegistrar.read.nameExpires([labelId('newname')])
    const balanceBefore = await publicClient.getBalance({
      address: ethRegistrarController.address,
    })

    const duration = REGISTRATION_TIME // Use 28 days to meet MIN_REGISTRATION_DURATION
    const { base: price } = await ethRegistrarController.read.rentPrice([
      'newname',
      duration,
      false,
    ])

    await ethRegistrarController.write.renew(['newname', duration, false], {
      value: price,
    })

    const newExpires = await baseRegistrar.read.nameExpires([
      labelId('newname'),
    ])
    const newFuseExpiry = await nameWrapper.read
      .getData([hexToBigInt(nodehash)])
      .then((d) => d[2])

    expect(newExpires - expires).toEqual(duration)
    expect(newFuseExpiry - fuseExpiry).toEqual(duration)

    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(balanceBefore + price)
  })

  it('non wrapped names can renew', async () => {
    const { nameWrapper, baseRegistrar, ethRegistrarController, ownerAccount } =
      await loadFixture(fixture)

    const label = 'newname'
    const tokenId = labelId(label)
    const nodehash = namehash(`${label}.id`)
    const duration = REGISTRATION_TIME // Use 28 days to meet MIN_REGISTRATION_DURATION
    // this is to allow user to register without namewrapped
    await baseRegistrar.write.addController([ownerAccount.address])
    await baseRegistrar.write.register([
      tokenId,
      ownerAccount.address,
      duration,
    ])

    await expect(
      nameWrapper.read.ownerOf([hexToBigInt(nodehash)]),
    ).resolves.toEqual(zeroAddress)
    await expect(baseRegistrar.read.ownerOf([tokenId])).resolves.toEqualAddress(
      ownerAccount.address,
    )

    const expires = await baseRegistrar.read.nameExpires([tokenId])
    const { base: price } = await ethRegistrarController.read.rentPrice([
      label,
      duration,
      false,
    ])
    await ethRegistrarController.write.renew([label, duration, false], {
      value: price,
    })

    await expect(baseRegistrar.read.ownerOf([tokenId])).resolves.toEqualAddress(
      ownerAccount.address,
    )
    await expect(
      nameWrapper.read.ownerOf([hexToBigInt(nodehash)]),
    ).resolves.toEqual(zeroAddress)

    const newExpires = await baseRegistrar.read.nameExpires([tokenId])
    expect(newExpires - expires).toEqual(duration)
  })

  it('should require sufficient value for a renewal', async () => {
    const { ethRegistrarController } = await loadFixture(fixture)

    await expect(ethRegistrarController)
      .write('renew', ['newname', REGISTRATION_TIME, false])
      .toBeRevertedWithCustomError('InsufficientValue')
  })

  it('should allow anyone to withdraw funds and transfer to the registrar owner', async () => {
    const { ethRegistrarController, ownerAccount, publicClient } =
      await loadFixture(fixture)

    await registerName(
      { ethRegistrarController },
      {
        label: 'newname',
        duration: REGISTRATION_TIME,
        ownerAddress: ownerAccount.address,
      },
    )

    await ethRegistrarController.write.withdraw()
    await expect(
      publicClient.getBalance({ address: ethRegistrarController.address }),
    ).resolves.toEqual(0n)
  })

  it('should set the reverse record of the account', async () => {
    const {
      ethRegistrarController,
      publicResolver,
      registrantAccount,
      ownerAccount,
    } = await loadFixture(fixture)

    await registerName(
      { ethRegistrarController },
      {
        label: 'reverse',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        shouldSetReverseRecord: true,
      },
    )

    await expect(
      publicResolver.read.name([
        namehash(getReverseNode(ownerAccount.address)),
      ]),
    ).resolves.toEqual('reverse.id')
  })

  it('should not set the reverse record of the account when set to false', async () => {
    const { ethRegistrarController, publicResolver, registrantAccount } =
      await loadFixture(fixture)

    await registerName(
      { ethRegistrarController },
      {
        label: 'reverse',
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        shouldSetReverseRecord: false,
      },
    )

    await expect(
      publicResolver.read.name([
        namehash(getReverseNode(registrantAccount.address)),
      ]),
    ).resolves.toEqual('')
  })

  it('should auto wrap the name and set the ERC721 owner to the wrapper', async () => {
    const {
      ensRegistry,
      baseRegistrar,
      ethRegistrarController,
      nameWrapper,
      registrantAccount,
    } = await loadFixture(fixture)

    const label = 'wrapper'
    const name = label + '.id'
    await registerName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
      },
    )

    await expect(
      nameWrapper.read.ownerOf([hexToBigInt(namehash(name))]),
    ).resolves.toEqualAddress(registrantAccount.address)

    await expect(
      ensRegistry.read.owner([namehash(name)]),
    ).resolves.toEqualAddress(nameWrapper.address)
    await expect(
      baseRegistrar.read.ownerOf([labelId(label)]),
    ).resolves.toEqualAddress(nameWrapper.address)
  })

  it('should auto wrap the name and allow fuses and expiry to be set', async () => {
    const {
      baseRegistrar,
      ethRegistrarController,
      nameWrapper,
      registrantAccount,
    } = await loadFixture(fixture)

    const label = 'fuses'
    const name = label + '.id'

    await registerName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        ownerControlledFuses: 1,
      },
    )

    const [, fuses, expiry] = await nameWrapper.read.getData([
      hexToBigInt(namehash(name)),
    ])

    // Get the actual expiry from the base registrar (source of truth)
    const baseExpiry = await baseRegistrar.read.nameExpires([labelId(label)])

    expect(fuses).toEqual(
      FUSES.PARENT_CANNOT_CONTROL | FUSES.CANNOT_UNWRAP | FUSES.IS_DOT_ETH,
    )
    // Expiry should be baseExpiry + GRACE_PERIOD
    expect(expiry).toEqual(baseExpiry + GRACE_PERIOD)
  })

  it('approval should reduce gas for registration', async () => {
    const {
      publicClient,
      ensRegistry,
      baseRegistrar,
      ethRegistrarController,
      nameWrapper,
      registrantAccount,
      publicResolver,
    } = await loadFixture(fixture)

    const label = 'other'
    const name = label + '.id'
    const node = namehash(name)

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        data: [
          encodeFunctionData({
            abi: publicResolver.abi,
            functionName: 'setAddr',
            args: [node, registrantAccount.address],
          }),
        ],
        ownerControlledFuses: 1,
        shouldSetReverseRecord: true,
      },
    )

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    const registerArgs = [request, referralData, EMPTY_REFERRAL_SIGNATURE] as const

    const gasA = await ethRegistrarController.estimateGas.register(registerArgs, {
      value,
      account: registrantAccount,
    })

    await publicResolver.write.setApprovalForAll(
      [ethRegistrarController.address, true],
      { account: registrantAccount },
    )

    const gasB = await ethRegistrarController.estimateGas.register(registerArgs, {
      value,
      account: registrantAccount,
    })

    const hash = await ethRegistrarController.write.register(registerArgs, {
      value,
      account: registrantAccount,
    })

    const receipt = await publicClient.getTransactionReceipt({ hash })

    expect(receipt.gasUsed).toBeLessThan(gasA)

    console.log('Gas saved:', gasA - receipt.gasUsed)

    await expect(
      nameWrapper.read.ownerOf([hexToBigInt(node)]),
    ).resolves.toEqualAddress(registrantAccount.address)
    await expect(ensRegistry.read.owner([node])).resolves.toEqualAddress(
      nameWrapper.address,
    )
    await expect(
      baseRegistrar.read.ownerOf([labelId(label)]),
    ).resolves.toEqualAddress(nameWrapper.address)
    await expect<Promise<Address>>(
      publicResolver.read.addr([node]),
    ).resolves.toEqualAddress(registrantAccount.address)
  })

  it('should not permit new registrations with non resolver function calls', async () => {
    const {
      baseRegistrar,
      ethRegistrarController,
      registrantAccount,
      publicResolver,
    } = await loadFixture(fixture)

    const label = 'newconfigname'
    const name = label + '.id'
    const node = namehash(name)
    const secondTokenDuration = 788400000n // keep bogus NFT for 25 years;
    const callData = [
      encodeFunctionData({
        abi: baseRegistrar.abi,
        functionName: 'register',
        args: [
          hexToBigInt(node),
          registrantAccount.address,
          secondTokenDuration,
        ],
      }),
    ]

    const { request, params } = await commitName(
      { ethRegistrarController },
      {
        label,
        duration: REGISTRATION_TIME,
        ownerAddress: registrantAccount.address,
        resolverAddress: publicResolver.address,
        data: callData,
      },
    )

    const referralData = {
      ...EMPTY_REFERRAL_DATA,
      registrant: registrantAccount.address,
    }

    const { base, premium } = await ethRegistrarController.read.rentPrice([
      params.label,
      params.duration,
      params.lifetime,
    ])
    const value = base + premium

    await expect(ethRegistrarController)
      .write('register', [request, referralData, EMPTY_REFERRAL_SIGNATURE], { value })
      .toBeRevertedWithoutReason()
  })
})
