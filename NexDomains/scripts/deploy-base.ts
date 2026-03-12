import { ethers } from 'hardhat'
import { namehash, labelhash, zeroHash } from 'viem'

/**
 * SafuDomains v2 - Base Chain Deployment Script
 * 
 * Deploys the agent-first domain registration system:
 * - AgentPriceOracle (with pattern matching and tiered pricing)
 * - AgentRegistrarController (lifetime-only, no renewals)
 * - AgentPublicResolver (with x402/ERC-8004 payment support)
 * 
 * Prerequisites:
 * - DEPLOYER_KEY in .env
 * - BASESCAN_API_KEY in .env (for verification)
 * - Existing ENS infrastructure or deploy fresh
 */

// Base chain constants
const BASE_MAINNET_ETH_USD_ORACLE = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'
const BASE_SEPOLIA_ETH_USD_ORACLE = '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1' // Chainlink Base Sepolia
const BASE_MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Circle USDC on Base Sepolia

async function main() {
    const [deployer] = await ethers.getSigners()
    console.log('Deploying SafuDomains v2 with account:', deployer.address)
    console.log('Account balance:', (await deployer.provider?.getBalance(deployer.address))?.toString())

    const network = await ethers.provider.getNetwork()
    const chainId = Number(network.chainId)
    console.log('Chain ID:', chainId)

    // Select oracle and USDC addresses based on network
    let ethUsdOracle: string
    let usdcAddress: string

    if (chainId === 8453) {
        // Base Mainnet
        ethUsdOracle = BASE_MAINNET_ETH_USD_ORACLE
        usdcAddress = BASE_MAINNET_USDC
    } else if (chainId === 84532) {
        // Base Sepolia
        ethUsdOracle = BASE_SEPOLIA_ETH_USD_ORACLE
        usdcAddress = BASE_SEPOLIA_USDC
    } else {
        throw new Error(`Unsupported chain ID: ${chainId}. Use Base Mainnet (8453) or Base Sepolia (84532)`)
    }

    console.log('ETH/USD Oracle:', ethUsdOracle)
    console.log('USDC Address:', usdcAddress)
    console.log('')

    // ============ Deploy Core Infrastructure ============
    // Note: For a fresh deployment, you'd also need to deploy:
    // - ENSRegistry
    // - BaseRegistrarImplementation
    // - NameWrapper
    // - ReverseRegistrar
    // 
    // For this script, we assume these exist or you're using existing deployments

    // ============ Deploy AgentPriceOracle ============
    console.log('Deploying AgentPriceOracle...')
    const AgentPriceOracle = await ethers.getContractFactory('AgentPriceOracle')
    const agentPriceOracle = await AgentPriceOracle.deploy(ethUsdOracle)
    await agentPriceOracle.waitForDeployment()
    const priceOracleAddress = await agentPriceOracle.getAddress()
    console.log('AgentPriceOracle deployed to:', priceOracleAddress)

    // Test the price oracle
    console.log('Testing price oracle...')
    const agentNamePrice = await agentPriceOracle.getPrice('personal-learning-agent')
    console.log('  personal-learning-agent (agent name):')
    console.log('    isAgentName:', agentNamePrice.isAgentName)
    console.log('    priceUsd:', ethers.formatUnits(agentNamePrice.priceUsd, 18), 'USD')
    console.log('    priceWei:', ethers.formatEther(agentNamePrice.priceWei), 'ETH')

    const standardNamePrice = await agentPriceOracle.getPrice('alice')
    console.log('  alice (standard name):')
    console.log('    isAgentName:', standardNamePrice.isAgentName)
    console.log('    priceUsd:', ethers.formatUnits(standardNamePrice.priceUsd, 18), 'USD')
    console.log('    priceWei:', ethers.formatEther(standardNamePrice.priceWei), 'ETH')
    console.log('')

    // ============ Note: Full deployment requires existing infrastructure ============
    console.log('============================================')
    console.log('AgentPriceOracle deployed successfully!')
    console.log('')
    console.log('To complete deployment, you need:')
    console.log('1. ENSRegistry at deployed address')
    console.log('2. BaseRegistrarImplementation')
    console.log('3. NameWrapper')
    console.log('4. ReverseRegistrar')
    console.log('')
    console.log('Then deploy:')
    console.log('- AgentRegistrarController(base, priceOracle, reverseRegistrar, nameWrapper, usdc)')
    console.log('- AgentPublicResolver(ens, nameWrapper, agentController, reverseRegistrar)')
    console.log('============================================')
    console.log('')

    // ============ Verification Instructions ============
    console.log('To verify on Basescan:')
    console.log(`npx hardhat verify --network ${chainId === 8453 ? 'base' : 'baseSepolia'} ${priceOracleAddress} "${ethUsdOracle}"`)

    return {
        agentPriceOracle: priceOracleAddress,
        ethUsdOracle,
        usdcAddress,
    }
}

main()
    .then((addresses) => {
        console.log('')
        console.log('Deployment complete!')
        console.log('Addresses:', JSON.stringify(addresses, null, 2))
        process.exit(0)
    })
    .catch((error) => {
        console.error('Deployment failed:', error)
        process.exit(1)
    })
