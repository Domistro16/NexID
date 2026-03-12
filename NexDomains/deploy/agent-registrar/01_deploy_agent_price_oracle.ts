import type { DeployFunction } from 'hardhat-deploy/types.js'
import type { Address } from 'viem'

const func: DeployFunction = async function (hre) {
    const { network, viem } = hre

    const { deployer, owner } = await viem.getNamedClients()

    // Determine the Chainlink ETH/USD oracle address for the AgentPriceOracle
    let oracleAddress: Address

    if (process.env.PRICE_ORACLE) {
        // Explicit override from environment
        oracleAddress = process.env.PRICE_ORACLE as Address
    } else if (network.tags.test) {
        // On test networks, use the DummyOracle deployed by TokenPriceOracle step
        const dummyOracle = await viem.getContract('DummyOracle')
        oracleAddress = dummyOracle.address as Address
        console.log(`Using DummyOracle at ${oracleAddress} for AgentPriceOracle`)
    } else if (network.name === 'base') {
        // Base mainnet Chainlink ETH/USD feed
        oracleAddress = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'
    } else {
        // BSC mainnet Chainlink ETH/USD feed (fallback)
        oracleAddress = '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE'
    }

    console.log(`Deploying AgentPriceOracle with oracle: ${oracleAddress}`)

    const priceOracleDeployment = await viem.deploy('AgentPriceOracle', [oracleAddress])
    if (!priceOracleDeployment.newlyDeployed) return

    const priceOracle = await viem.getContract('AgentPriceOracle')

    // Transfer ownership if deployer is not the owner
    if (owner.address !== deployer.address) {
        const hash = await priceOracle.write.transferOwnership([owner.address])
        console.log(
            `Transferring ownership of AgentPriceOracle to ${owner.address} (tx: ${hash})...`,
        )
        await viem.waitForTransactionSuccess(hash)
    }

    console.log(`AgentPriceOracle deployed at ${priceOracle.address}`)
}

func.id = 'agent-price-oracle'
func.tags = ['agent', 'AgentPriceOracle']
func.dependencies = ['TokenPriceOracle']

export default func
