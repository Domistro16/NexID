import type { DeployFunction } from 'hardhat-deploy/types.js'

/**
 * Sets up royalty receivers on BaseRegistrar and NameWrapper
 * Must run AFTER those contracts are deployed
 */
const func: DeployFunction = async function (hre) {
    const { viem } = hre

    const { owner } = await viem.getNamedClients()

    const baseRegistrar = await viem.getContract('BaseRegistrarImplementation', owner)
    const nameWrapper = await viem.getContract('NameWrapper', owner)

    // Set royalty receiver to owner (treasury)
    const treasury = owner.address

    console.log(`Setting royalty receiver to ${treasury}...`)

    // Set on BaseRegistrar (ERC-721)
    const hash1 = await baseRegistrar.write.setRoyaltyReceiver([treasury])
    console.log(`Setting royalty receiver on BaseRegistrar (tx: ${hash1})...`)
    await viem.waitForTransactionSuccess(hash1)

    // Set on NameWrapper (ERC-1155)
    const hash2 = await nameWrapper.write.setRoyaltyReceiver([treasury])
    console.log(`Setting royalty receiver on NameWrapper (tx: ${hash2})...`)
    await viem.waitForTransactionSuccess(hash2)

    console.log(`Royalty receiver set to ${treasury} on both contracts`)
    console.log(`Royalty rate: 5% (500 basis points)`)
}

func.id = 'setup-royalties'
func.tags = ['royalty', 'setup']
func.dependencies = ['BaseRegistrarImplementation', 'NameWrapper']

export default func
