import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { namehash, labelhash, zeroAddress, zeroHash } from 'viem'

/**
 * AgentRegistrarController Tests
 * 
 * Tests for registration functionality:
 * - Single registration with ETH
 * - USDC registration
 * - Batch registration
 * - Commit-reveal for standard names
 * - Skip commit-reveal for agent names in agent mode
 * - No renewal functions
 */

const LIFETIME_DURATION = 100n * 365n * 24n * 60n * 60n // 100 years in seconds

// Empty referral data for tests
const emptyReferralData = {
    referrer: zeroAddress,
    registrant: zeroAddress,
    nameHash: zeroHash,
    referrerCodeHash: zeroHash,
    deadline: 0n,
    nonce: zeroHash,
}

async function fixture() {
    const publicClient = await hre.viem.getPublicClient()
    const [owner, registrant, other] = await hre.viem.getWalletClients()

    // Deploy core infrastructure
    const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])
    const baseRegistrar = await hre.viem.deployContract('BaseRegistrarImplementation', [
        ensRegistry.address,
        namehash('id'),
    ])
    const reverseRegistrar = await hre.viem.deployContract('ReverseRegistrar', [
        ensRegistry.address,
    ])

    // Set up reverse registrar
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

    // Deploy name wrapper
    const nameWrapper = await hre.viem.deployContract('NameWrapper', [
        ensRegistry.address,
        baseRegistrar.address,
        owner.account.address,
    ])

    // Set up base registrar
    await ensRegistry.write.setSubnodeOwner([
        zeroHash,
        labelhash('id'),
        baseRegistrar.address,
    ])

    // Deploy mock oracles
    const dummyOracle = await hre.viem.deployContract('DummyOracle', [200000000000n]) // $2000 ETH

    // Deploy mock USDC (6 decimals)
    const mockUSDC = await hre.viem.deployContract('MockUSDC', [])

    // Deploy AgentPriceOracle
    const agentPriceOracle = await hre.viem.deployContract('AgentPriceOracle', [
        dummyOracle.address,
    ])

    // Deploy AgentRegistrarController
    const agentRegistrarController = await hre.viem.deployContract('AgentRegistrarController', [
        baseRegistrar.address,
        agentPriceOracle.address,
        reverseRegistrar.address,
        nameWrapper.address,
        mockUSDC.address,
        zeroAddress, // No referral verifier for testing
    ])

    // Set up permissions
    await nameWrapper.write.setController([agentRegistrarController.address, true])
    await baseRegistrar.write.addController([nameWrapper.address])
    await reverseRegistrar.write.setController([agentRegistrarController.address, true])

    // Deploy resolver
    const agentPublicResolver = await hre.viem.deployContract('AgentPublicResolver', [
        ensRegistry.address,
        nameWrapper.address,
        agentRegistrarController.address,
        reverseRegistrar.address,
    ])

    // Mint some USDC to registrant
    await mockUSDC.write.mint([registrant.account.address, 1000000000n]) // 1000 USDC

    return {
        ensRegistry,
        baseRegistrar,
        reverseRegistrar,
        nameWrapper,
        dummyOracle,
        mockUSDC,
        agentPriceOracle,
        agentRegistrarController,
        agentPublicResolver,
        publicClient,
        owner,
        registrant,
        other,
    }
}

describe('AgentRegistrarController', () => {
    describe('available', () => {
        it('should report unused names as available', async () => {
            const { agentRegistrarController } = await loadFixture(fixture)
            expect(await agentRegistrarController.read.available(['available-name'])).to.equal(true)
        })
    })

    describe('valid', () => {
        it('should accept names with 2+ characters', async () => {
            const { agentRegistrarController } = await loadFixture(fixture)
            expect(await agentRegistrarController.read.valid(['ab'])).to.equal(true)
            expect(await agentRegistrarController.read.valid(['test'])).to.equal(true)
        })

        it('should reject names with less than 2 characters', async () => {
            const { agentRegistrarController } = await loadFixture(fixture)
            expect(await agentRegistrarController.read.valid(['a'])).to.equal(false)
        })
    })

    describe('rentPrice', () => {
        it('should return price information', async () => {
            const { agentRegistrarController } = await loadFixture(fixture)
            const [priceWei, priceUsd, isAgentName] = await agentRegistrarController.read.rentPrice([
                'personal-learning-agent',
            ])
            expect(isAgentName).to.equal(true)
            expect(priceUsd).to.be.greaterThan(0n)
            expect(priceWei).to.be.greaterThan(0n)
        })
    })

    describe('register', () => {
        it('should register an agent name without commit-reveal (agent mode)', async () => {
            const { agentRegistrarController, nameWrapper, registrant, agentPublicResolver } =
                await loadFixture(fixture)

            const name = 'personal-learning-agent'
            const [priceWei] = await agentRegistrarController.read.rentPrice([name])

            const request = {
                name,
                owner: registrant.account.address,
                secret: zeroHash,
                resolver: agentPublicResolver.address,
                data: [],
                reverseRecord: false,
                ownerControlledFuses: 0,
            }

            // Should succeed without commit (agent mode enabled by default)
            const registrantController = await hre.viem.getContractAt(
                'AgentRegistrarController',
                agentRegistrarController.address,
                { client: { wallet: registrant } }
            )

            await registrantController.write.register([request, emptyReferralData, '0x'], { value: priceWei })

            // Verify registration
            expect(await agentRegistrarController.read.available([name])).to.equal(false)
        })

        it('should require commit-reveal for standard names', async () => {
            const { agentRegistrarController, agentPublicResolver, registrant } =
                await loadFixture(fixture)

            // Disable agent mode first
            await agentRegistrarController.write.setAgentMode([false])

            const name = 'standard-name'
            const [priceWei] = await agentRegistrarController.read.rentPrice([name])

            const request = {
                name,
                owner: registrant.account.address,
                secret: zeroHash,
                resolver: agentPublicResolver.address,
                data: [],
                reverseRecord: false,
                ownerControlledFuses: 0,
            }

            const registrantController = await hre.viem.getContractAt(
                'AgentRegistrarController',
                agentRegistrarController.address,
                { client: { wallet: registrant } }
            )

            // Should fail without commitment
            let failed = false
            try {
                await registrantController.write.register([request, emptyReferralData, '0x'], { value: priceWei })
            } catch (e) {
                failed = true
            }
            expect(failed).to.equal(true)
        })

        it('should register with exact payment', async () => {
            const { agentRegistrarController, agentPublicResolver, registrant } =
                await loadFixture(fixture)

            const name = 'my-second-learning-agent'
            const [priceWei] = await agentRegistrarController.read.rentPrice([name])

            const request = {
                name,
                owner: registrant.account.address,
                secret: zeroHash,
                resolver: agentPublicResolver.address,
                data: [],
                reverseRecord: false,
                ownerControlledFuses: 0,
            }

            const registrantController = await hre.viem.getContractAt(
                'AgentRegistrarController',
                agentRegistrarController.address,
                { client: { wallet: registrant } }
            )

            // Register with exact price - should succeed
            await registrantController.write.register([request, emptyReferralData, '0x'], { value: priceWei })

            // Verify registration
            expect(await agentRegistrarController.read.available([name])).to.equal(false)
        })
    })

    describe('batchRegister', () => {
        it('should register multiple names in one transaction', async () => {
            const { agentRegistrarController, agentPublicResolver, registrant, publicClient } =
                await loadFixture(fixture)

            const names = [
                'agent-one-batch-test',
                'agent-two-batch-test',
                'agent-three-batch-test',
            ]

            let totalPrice = 0n
            const requests = []

            for (const name of names) {
                const [priceWei] = await agentRegistrarController.read.rentPrice([name])
                totalPrice += priceWei
                requests.push({
                    name,
                    owner: registrant.account.address,
                    secret: zeroHash,
                    resolver: agentPublicResolver.address,
                    data: [],
                    reverseRecord: false,
                    ownerControlledFuses: 0,
                })
            }

            const registrantController = await hre.viem.getContractAt(
                'AgentRegistrarController',
                agentRegistrarController.address,
                { client: { wallet: registrant } }
            )

            await registrantController.write.batchRegister([requests], { value: totalPrice })

            // Verify all registered
            for (const name of names) {
                expect(await agentRegistrarController.read.available([name])).to.equal(false)
            }
        })

        it('should reject batches larger than MAX_BATCH_SIZE', async () => {
            const { agentRegistrarController, agentPublicResolver, registrant } =
                await loadFixture(fixture)

            // Create 51 requests (MAX_BATCH_SIZE is 50)
            const requests = []
            for (let i = 0; i < 51; i++) {
                requests.push({
                    name: `agent-batch-test-${i.toString().padStart(3, '0')}`,
                    owner: registrant.account.address,
                    secret: zeroHash,
                    resolver: agentPublicResolver.address,
                    data: [],
                    reverseRecord: false,
                    ownerControlledFuses: 0,
                })
            }

            const registrantController = await hre.viem.getContractAt(
                'AgentRegistrarController',
                agentRegistrarController.address,
                { client: { wallet: registrant } }
            )

            let failed = false
            try {
                await registrantController.write.batchRegister([requests], { value: 10n ** 18n })
            } catch (e) {
                failed = true
            }
            expect(failed).to.equal(true)
        })
    })

    describe('no renewals', () => {
        it('should not have a renew function', async () => {
            const { agentRegistrarController } = await loadFixture(fixture)

            // Check that renew function doesn't exist on the ABI
            const abi = (agentRegistrarController as any).abi
            const renewFunction = abi?.find((item: any) => item.name === 'renew')
            expect(renewFunction).to.be.undefined
        })
    })

    describe('admin functions', () => {
        it('should allow owner to toggle agent mode', async () => {
            const { agentRegistrarController } = await loadFixture(fixture)

            await agentRegistrarController.write.setAgentMode([false])
            // No error = success
        })

        it('should allow owner to withdraw ETH', async () => {
            const { agentRegistrarController, agentPublicResolver, registrant, owner, publicClient } =
                await loadFixture(fixture)

            // First register a name to add funds
            const name = 'personal-learning-agent'
            const [priceWei] = await agentRegistrarController.read.rentPrice([name])

            const request = {
                name,
                owner: registrant.account.address,
                secret: zeroHash,
                resolver: agentPublicResolver.address,
                data: [],
                reverseRecord: false,
                ownerControlledFuses: 0,
            }

            const registrantController = await hre.viem.getContractAt(
                'AgentRegistrarController',
                agentRegistrarController.address,
                { client: { wallet: registrant } }
            )

            await registrantController.write.register([request, emptyReferralData, '0x'], { value: priceWei })

            // Check contract balance
            const contractBalance = await publicClient.getBalance({
                address: agentRegistrarController.address,
            })
            expect(contractBalance).to.be.greaterThan(0n)

            // Withdraw
            await agentRegistrarController.write.withdraw([owner.account.address])

            // Check contract balance is now 0
            const balanceAfter = await publicClient.getBalance({
                address: agentRegistrarController.address,
            })
            expect(balanceAfter).to.equal(0n)
        })
    })
})
