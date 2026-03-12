import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { namehash, labelhash, zeroHash } from 'viem'

/**
 * PaymentResolver Tests
 * 
 * Tests for x402 protocol and ERC-8004 agent payments:
 * - x402 endpoint management
 * - Chain-specific payment addresses
 * - Agent metadata
 * - Payment enabled flag
 */

async function fixture() {
    const publicClient = await hre.viem.getPublicClient()
    const [owner, registrant] = await hre.viem.getWalletClients()

    // Deploy core infrastructure
    const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
    const baseRegistrar = await hre.viem.deployContract('BaseRegistrarImplementation', [
        ensRegistry.address,
        namehash('id'),
    ])
    const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
        ensRegistry.address,
    ])

    // Set up reverse registrar - first claim 'reverse' TLD
    await ensRegistry.write.setSubnodeOwner([
        zeroHash,
        labelhash('reverse'),
        owner.account.address,
    ])
    await ensRegistry.write.setSubnodeOwner([
        namehash('reverse'),
        labelhash('addr'),
        reverseRegistrar.address,
    ])

    const nameWrapper = await hre.viem.deployContract('NameWrapper', [
        ensRegistry.address,
        baseRegistrar.address,
        owner.account.address,
    ])

    // Set up id TLD - owner must own it first
    await ensRegistry.write.setSubnodeOwner([
        zeroHash,
        labelhash('id'),
        owner.account.address,
    ])

    // Deploy AgentPublicResolver
    const agentPublicResolver = await hre.viem.deployContract('AgentPublicResolver', [
        ensRegistry.address,
        nameWrapper.address,
        owner.account.address, // trusted controller
        reverseRegistrar.address,
    ])

    // Create a test node under id
    const testNode = namehash('test.id')

    // Owner can set subnode since they own id
    await ensRegistry.write.setSubnodeOwner([
        namehash('id'),
        labelhash('test'),
        owner.account.address,
    ])
    await ensRegistry.write.setResolver([testNode, agentPublicResolver.address])

    return {
        ensRegistry,
        baseRegistrar,
        nameWrapper,
        agentPublicResolver,
        publicClient,
        owner,
        registrant,
        testNode,
    }
}

describe('PaymentResolver', () => {
    describe('x402Endpoint', () => {
        it('should set and get x402 endpoint', async () => {
            const { agentPublicResolver, testNode } = await loadFixture(fixture)

            const endpoint = 'https://api.myagent.id/x402'
            await agentPublicResolver.write.setX402Endpoint([testNode, endpoint])

            const result = await agentPublicResolver.read.x402Endpoint([testNode])
            expect(result).to.equal(endpoint)
        })

        it('should return empty string for unset endpoint', async () => {
            const { agentPublicResolver } = await loadFixture(fixture)

            // Use a random node that hasn't been set
            const randomNode = namehash('random.id')
            const result = await agentPublicResolver.read.x402Endpoint([randomNode])
            expect(result).to.equal('')
        })
    })

    describe('paymentAddress', () => {
        it('should set and get payment address per chain', async () => {
            const { agentPublicResolver, testNode, owner } = await loadFixture(fixture)

            const baseChainId = 8453n
            const addr = owner.account.address

            await agentPublicResolver.write.setPaymentAddress([testNode, baseChainId, addr])

            const result = await agentPublicResolver.read.paymentAddress([testNode, baseChainId])
            expect(result.toLowerCase()).to.equal(addr.toLowerCase())
        })

        it('should track supported chains', async () => {
            const { agentPublicResolver, testNode, owner } = await loadFixture(fixture)

            const chains = [8453n, 1n, 42161n] // Base, Ethereum, Arbitrum

            for (const chainId of chains) {
                await agentPublicResolver.write.setPaymentAddress([testNode, chainId, owner.account.address])
            }

            const supported = await agentPublicResolver.read.supportedChains([testNode])
            expect(supported.length).to.equal(3)
        })
    })

    describe('agentMetadata', () => {
        it('should set and get agent metadata URI', async () => {
            const { agentPublicResolver, testNode } = await loadFixture(fixture)

            const uri = 'ipfs://QmXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXx'
            await agentPublicResolver.write.setAgentMetadata([testNode, uri])

            const result = await agentPublicResolver.read.agentMetadata([testNode])
            expect(result).to.equal(uri)
        })

        it('should support HTTP URIs', async () => {
            const { agentPublicResolver, testNode } = await loadFixture(fixture)

            const uri = 'https://api.myagent.id/metadata.json'
            await agentPublicResolver.write.setAgentMetadata([testNode, uri])

            const result = await agentPublicResolver.read.agentMetadata([testNode])
            expect(result).to.equal(uri)
        })
    })

    describe('paymentEnabled', () => {
        it('should toggle payment enabled flag', async () => {
            const { agentPublicResolver, testNode } = await loadFixture(fixture)

            // Enable payments
            await agentPublicResolver.write.setPaymentEnabled([testNode, true])
            expect(await agentPublicResolver.read.paymentEnabled([testNode])).to.equal(true)

            // Disable payments
            await agentPublicResolver.write.setPaymentEnabled([testNode, false])
            expect(await agentPublicResolver.read.paymentEnabled([testNode])).to.equal(false)
        })
    })

    describe('authorization', () => {
        it('should reject unauthorized callers', async () => {
            const { agentPublicResolver, testNode, registrant } = await loadFixture(fixture)

            const registrantResolver = await hre.viem.getContractAt(
                'AgentPublicResolver',
                agentPublicResolver.address,
                { client: { wallet: registrant } }
            )

            // Should fail - registrant is not authorized
            let failed = false
            try {
                await registrantResolver.write.setX402Endpoint([testNode, 'https://example.com'])
            } catch (e) {
                failed = true
            }
            expect(failed).to.equal(true)
        })
    })

    describe('supportsInterface', () => {
        it('should support IERC165 interface', async () => {
            const { agentPublicResolver } = await loadFixture(fixture)

            // IERC165 interface ID
            const supports = await agentPublicResolver.read.supportsInterface(['0x01ffc9a7'])
            expect(supports).to.equal(true)
        })
    })
})
