import type { DeployFunction } from 'hardhat-deploy/types.js'
import { createNonceWaiter } from '../../deploy-utils/waitForNonce.js'

const func: DeployFunction = async function (hre) {
    const { network, viem } = hre
    const waitNonce = createNonceWaiter(viem)

    const { deployer, owner } = await viem.getNamedClients()

    // ERC-4337 EntryPoint v0.6 (same on all networks)
    const entryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as `0x${string}`

    // Step 1: Deploy the SimpleAgentAccount implementation
    const implDeployment = await viem.deploy('SimpleAgentAccount', [])
    console.log(`SimpleAgentAccount implementation at ${implDeployment.address}`)

    if (implDeployment.transactionHash) {
        await waitNonce(implDeployment.transactionHash)
    }

    // Step 2: Deploy the AgentAccountFactory
    const factoryDeployment = await viem.deploy('AgentAccountFactory', [
        implDeployment.address,
        entryPoint,
    ])

    if (!factoryDeployment.newlyDeployed) return

    const factory = await viem.getContract('AgentAccountFactory')
    console.log(`AgentAccountFactory deployed at ${factory.address}`)
    console.log(`  - Implementation: ${implDeployment.address}`)
    console.log(`  - EntryPoint: ${entryPoint}`)

    // Step 3: Wire up to AgentRegistrarController
    const controller = await viem.getContract('AgentRegistrarController', owner)

    const setFactoryHash = await controller.write.setAccountFactory([factory.address])
    console.log(
        `Setting AccountFactory on AgentRegistrarController (tx: ${setFactoryHash})...`,
    )
    await viem.waitForTransactionSuccess(setFactoryHash)

    // Verify it was set
    for (let i = 0; i < 15; i++) {
        const currentFactory = await controller.read.accountFactory()
        if (currentFactory.toLowerCase() === factory.address.toLowerCase()) break
        console.log(
            `Waiting for accountFactory to propagate (attempt ${i + 1})...`,
        )
        await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    console.log(`AgentAccountFactory wired to AgentRegistrarController`)
}

func.id = 'agent-account-factory'
func.tags = ['agent', 'AgentAccountFactory']
func.dependencies = ['AgentRegistrarController']

export default func
