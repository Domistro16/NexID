import type { DeployFunction } from 'hardhat-deploy/types.js'
import { createNonceWaiter } from '../../deploy-utils/waitForNonce.js'

const func: DeployFunction = async function (hre) {
    const { network, viem } = hre
    const waitNonce = createNonceWaiter(viem)

    const { deployer, owner } = await viem.getNamedClients()

    const baseRegistrar = await viem.getContract('BaseRegistrarImplementation', owner)
    const priceOracle = await viem.getContract('AgentPriceOracle', owner)
    const reverseRegistrar = await viem.getContract('ReverseRegistrar', owner)
    const nameWrapper = await viem.getContract('NameWrapper', owner)

    // USDC address per network
    const usdcAddresses: Record<string, `0x${string}`> = {
        base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        baseSepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        hardhat: '0x0000000000000000000000000000000000000001', // Mock for local
        localhost: '0x0000000000000000000000000000000000000001',
    }

    const usdc = usdcAddresses[network.name] || usdcAddresses.baseSepolia

    // Deploy ReferralVerifier
    const referralVerifierDeployment = await viem.deploy('ReferralVerifier', [
        owner.address,
        baseRegistrar.address,
        nameWrapper.address,
    ])
    const referralVerifier = referralVerifierDeployment.address
    console.log(`Deployed ReferralVerifier at ${referralVerifier}`)

    if (referralVerifierDeployment.transactionHash) {
        await waitNonce(referralVerifierDeployment.transactionHash)
    }

    const controllerDeployment = await viem.deploy('AgentRegistrarController', [
        baseRegistrar.address,
        priceOracle.address,
        reverseRegistrar.address,
        nameWrapper.address,
        usdc,
        referralVerifier,
    ])
    if (!controllerDeployment.newlyDeployed) return

    const controller = await viem.getContract('AgentRegistrarController')

    // Transfer ownership if deployer is not the owner
    if (owner.address !== deployer.address) {
        const hash = await controller.write.transferOwnership([owner.address])
        console.log(
            `Transferring ownership of AgentRegistrarController to ${owner.address} (tx: ${hash})...`,
        )
        await waitNonce(hash)

        // Verify ownership is propagated on the RPC before proceeding.
        for (let i = 0; i < 15; i++) {
            const currentOwner = await controller.read.owner()
            if (currentOwner.toLowerCase() === owner.address.toLowerCase()) break
            console.log(
                `Waiting for AgentRegistrarController ownership to propagate (attempt ${i + 1})...`,
            )
            await new Promise((resolve) => setTimeout(resolve, 2000))
        }
    }

    // Only attempt to make controller changes on testnets
    if (network.name === 'mainnet') return

    // Add controller to registrar
    const addControllerHash = await baseRegistrar.write.addController([
        controller.address,
    ])
    console.log(
        `Adding AgentRegistrarController as controller on registrar (tx: ${addControllerHash})...`,
    )
    await waitNonce(addControllerHash)

    // Add controller to NameWrapper
    const addWrapperControllerHash = await nameWrapper.write.setController([
        controller.address,
        true,
    ])
    console.log(
        `Adding AgentRegistrarController as controller on NameWrapper (tx: ${addWrapperControllerHash})...`,
    )
    await waitNonce(addWrapperControllerHash)

    // Add controller to ReverseRegistrar
    const addReverseControllerHash = await reverseRegistrar.write.setController([
        controller.address,
        true,
    ])
    console.log(
        `Adding AgentRegistrarController as controller on ReverseRegistrar (tx: ${addReverseControllerHash})...`,
    )
    await waitNonce(addReverseControllerHash)

    // Enable agent mode by default on testnets
    const enableAgentModeHash = await controller.write.setAgentMode([true])
    console.log(`Enabling agent mode (tx: ${enableAgentModeHash})...`)
    await viem.waitForTransactionSuccess(enableAgentModeHash)

    console.log(`AgentRegistrarController deployed at ${controller.address}`)
    console.log(`  - BaseRegistrar: ${baseRegistrar.address}`)
    console.log(`  - PriceOracle: ${priceOracle.address}`)
    console.log(`  - ReverseRegistrar: ${reverseRegistrar.address}`)
    console.log(`  - NameWrapper: ${nameWrapper.address}`)
    console.log(`  - USDC: ${usdc}`)
}

func.id = 'agent-registrar-controller'
func.tags = ['agent', 'AgentRegistrarController']
func.dependencies = [
    'BaseRegistrarImplementation',
    'setupRegistrar',
    'AgentPriceOracle',
    'ReverseRegistrar',
    'NameWrapper',
]

export default func
