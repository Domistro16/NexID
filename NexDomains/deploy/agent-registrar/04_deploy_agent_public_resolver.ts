import type { DeployFunction } from 'hardhat-deploy/types.js'

const func: DeployFunction = async function (hre) {
    const { viem } = hre

    const { deployer, owner } = await viem.getNamedClients()

    const registry = await viem.getContract('ENSRegistry', owner)
    const nameWrapper = await viem.getContract('NameWrapper', owner)
    const controller = await viem.getContract('AgentRegistrarController', owner)
    const reverseRegistrar = await viem.getContract('ReverseRegistrar', owner)

    const resolverDeployment = await viem.deploy('AgentPublicResolver', [
        registry.address,
        nameWrapper.address,
        controller.address,
        reverseRegistrar.address,
    ])
    if (!resolverDeployment.newlyDeployed) return

    const resolver = await viem.getContract('AgentPublicResolver')

    console.log(`AgentPublicResolver deployed at ${resolver.address}`)
    console.log(`  - Registry: ${registry.address}`)
    console.log(`  - NameWrapper: ${nameWrapper.address}`)
    console.log(`  - TrustedController: ${controller.address}`)
    console.log(`  - TrustedReverseRegistrar: ${reverseRegistrar.address}`)
}

func.id = 'agent-public-resolver'
func.tags = ['agent', 'AgentPublicResolver']
func.dependencies = [
    'registry',
    'NameWrapper',
    'AgentRegistrarController',
    'ReverseRegistrar',
]

export default func
