// scripts/smokeTestTestnetViem.ts
import hre from 'hardhat'
import {
  namehash,
  bytesToHex,
  zeroAddress,
  hexToBytes,
  keccak256,
  toBytes,
  encodeFunctionData,
} from 'viem'
import crypto from 'crypto'
import { createPublicClient, http } from 'viem'
import { bscTestnet, plasma } from 'viem/chains'
import ETHRegistrarController from '../artifacts/contracts/ethregistrar/ETHRegistrarController.sol/ETHRegistrarController.json'
import { normalize } from 'viem/ens'

async function main() {
  const { viem } = hre
  const { deployer } = await viem.getNamedClients()

  // ─── CONFIGURE THESE ────────────────────────────────────────────────────────

  const registry = await viem.getContract('ENSRegistry', deployer)
  const controller = await viem.getContract('ETHRegistrarController', deployer)
  const nameWrapper = await viem.getContract('NameWrapper', deployer)
  const resolver = await viem.getContract('PublicResolver', deployer)
  const names = ['Richardteng', 'eljaboom', 'zero']

  for (const name of names) {
    const TLD = 'id'
    const LABEL = normalize(name)
    const FULL_NAME = `${LABEL}.${TLD}`
    const DURATION = 31536000000n // 1 year in seconds
    const lifetime = true

    console.log(`\n🚀 Starting viem smoke test for ${FULL_NAME}\n`)

    // 1) Check availability
    const availableBefore = await controller.read.available([LABEL])
    console.log('available before:', availableBefore)

    // 2) Query rent price
    const priceData = await controller.read.rentPrice([
      LABEL,
      DURATION,
      lifetime,
    ])
    console.log(
      'rentPrice base/premium:',
      priceData.base.toString(),
      priceData.premium.toString(),
    )

    // 3) Make & submit commitment
    const secret = bytesToHex(crypto.randomBytes(32))
    const commitment = await controller.read.makeCommitment([
      LABEL,
      deployer.address,
      DURATION,
      secret,
      resolver.address,
      [],
      false,
      0,
      lifetime,
    ])
    console.log('commitment:', commitment)

    const byted = hexToBytes(commitment)
    const commitHash = await controller.write.commit([commitment])
    console.log('commit tx:', commitHash)
    await viem.waitForTransactionSuccess(commitHash)

    // 4) Wait for minCommitmentAge + buffer
    const minAge = await controller.read.minCommitmentAge()
    const waitMs = Number(minAge) * 1000 + 5000
    console.log(`waiting ${waitMs / 1000}s for commitment age...`)
    await new Promise((r) => setTimeout(r, waitMs))

    // 5) Register name
    try {
      const registerHash = await controller.write.registerWithCard([
        LABEL,
        deployer.address,
        DURATION,
        secret,
        resolver.address,
        [],
        false,
        0,
        lifetime,
        '',
      ])
      console.log('⏳ register tx hash:', registerHash)

      await viem.waitForTransactionSuccess(registerHash)

      console.log('register tx:', registerHash)
      const registerRec = await viem.waitForTransactionSuccess(registerHash)

      // 6) Verify event
      const receipt = await viem.waitForTransactionSuccess(registerHash)
    } catch (err: any) {
      console.error('Full error:', err)
      console.error('cause:', err.cause)
      // If viem decoded the revert reason:
      console.error(
        'revert reason:',
        err.cause?.shortMessage ?? err.cause?.message,
      )
      // raw revert data (hex)
      console.error('revert data:', err.cause?.data)
    }

    // 7) Availability flips
    console.log('available after:', await controller.read.available([LABEL]))

    // 8) ENS registry owner
    const node = namehash(FULL_NAME)
    console.log('ENS.owner:', await registry.read.owner([node]))

    const CRE8OR_NODE =
      '0xf92e9539a836c60f519caef3f817b823139813f56a7a19c9621f7b47f35b340d'

    const labelhash = keccak256(toBytes(LABEL))
    // 2) Label hash
    const parentBytes = toBytes(CRE8OR_NODE) // Uint8Array of 32 bytes
    const labelBytes = toBytes(labelhash) // Uint8Array of 32 bytes

    // 2) Allocate and copy
    const packed = new Uint8Array(parentBytes.length + labelBytes.length)
    packed.set(parentBytes, 0)
    packed.set(labelBytes, parentBytes.length)

    const id = keccak256(packed)
    const wrapperData = await nameWrapper.read.getData([BigInt(id)])
    console.log('NameWrapper.getData owner:', wrapperData[0])

    // 10) Resolver resolution
    console.log('resolver.addr:', await resolver.read.addr([node]))
  }

  console.log('\n🎉 viem smoke test complete!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
