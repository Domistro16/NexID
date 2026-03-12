import type { DeployFunction } from 'hardhat-deploy/types.js'
import { parseEther } from 'viem'

const func: DeployFunction = async function (hre) {
    const { network, viem } = hre

    const { deployer, owner } = await viem.getNamedClients()

    const nameWrapper = await viem.getContract('NameWrapper', owner)

    // Use AgentPublicResolver on Base networks, fall back to PublicResolver
    let resolver
    if (network.name === 'base' || network.name === 'baseSepolia') {
        resolver = await viem.getContract('AgentPublicResolver', owner)
    } else {
        resolver = await viem.getContract('PublicResolver', owner)
    }

    // USDC address per network
    const usdcAddresses: Record<string, `0x${string}`> = {
        base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        baseSepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        hardhat: '0x0000000000000000000000000000000000000001', // Mock for local
        localhost: '0x0000000000000000000000000000000000000001',
    }

    const usdc = usdcAddresses[network.name] || usdcAddresses.baseSepolia

    // Treasury is the owner by default
    const treasury = owner.address

    const auctionDeployment = await viem.deploy('IDDomainAuction', [
        nameWrapper.address,
        resolver.address,
        usdc,
        treasury,
    ])
    if (!auctionDeployment.newlyDeployed) return

    const auction = await viem.getContract('IDDomainAuction')

    // Transfer ownership if deployer is not the owner
    if (owner.address !== deployer.address) {
        const hash = await auction.write.transferOwnership([owner.address])
        console.log(
            `Transferring ownership of IDDomainAuction to ${owner.address} (tx: ${hash})...`,
        )
        await viem.waitForTransactionSuccess(hash)
    }

    console.log(`IDDomainAuction deployed at ${auction.address}`)
    console.log(`  - NameWrapper: ${nameWrapper.address}`)
    console.log(`  - Resolver: ${resolver.address}`)
    console.log(`  - USDC: ${usdc}`)
    console.log(`  - Treasury: ${treasury}`)
}

func.id = 'id-domain-auction'
func.tags = ['auction', 'IDDomainAuction']
func.dependencies = ['NameWrapper', 'AgentPublicResolver', 'PublicResolver']

export default func
