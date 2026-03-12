import type { DeployFunction } from 'hardhat-deploy/types.js'
import { createNonceWaiter } from '../../deploy-utils/waitForNonce.js'

const func: DeployFunction = async function (hre) {
    const { viem } = hre
    const waitNonce = createNonceWaiter(viem)

    const { deployer, owner } = await viem.getNamedClients()

    const premiumRegistryDeployment = await viem.deploy('PremiumNameRegistry', [])
    if (!premiumRegistryDeployment.newlyDeployed) return

    const premiumRegistry = await viem.getContract('PremiumNameRegistry')

    // Transfer ownership if deployer is not the owner
    if (owner.address !== deployer.address) {
        const hash = await premiumRegistry.write.transferOwnership([owner.address])
        console.log(
            `Transferring ownership of PremiumNameRegistry to ${owner.address} (tx: ${hash})...`,
        )
        await waitNonce(hash)
    }

    // Add initial premium names
    const premiumNames = [
        // Tier 1: Ultra Premium
        'trader', 'defi', 'alpha', 'crypto', 'nft', 'web3', 'ai', 'bot', 'agent',
        // Tier 2: High Value
        'swap', 'yield', 'stake', 'vault', 'pool', 'farm', 'bridge', 'oracle',
        'signal', 'sniper', 'mev', 'arb', 'flash', 'whale', 'degen',
        // Tier 3: Meme/Culture
        '69', '420', '1337', 'gm', 'gn', 'wagmi', 'ngmi', 'lfg', 'fomo', 'hodl',
    ]

    // Add single letters (a-z)
    for (let i = 97; i <= 122; i++) {
        premiumNames.push(String.fromCharCode(i))
    }

    // Add single digits (0-9)
    for (let i = 0; i <= 9; i++) {
        premiumNames.push(i.toString())
    }

    console.log(`Adding ${premiumNames.length} premium names...`)

    // Batch add premium names
    const hash = await premiumRegistry.write.addPremiumNamesBatch([premiumNames])
    console.log(`Adding premium names batch (tx: ${hash})...`)
    await viem.waitForTransactionSuccess(hash)
    console.log(`Added ${premiumNames.length} premium names to registry`)
}

func.id = 'premium-name-registry'
func.tags = ['auction', 'PremiumNameRegistry']
func.dependencies = []

export default func
