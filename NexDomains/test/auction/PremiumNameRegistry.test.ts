import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'

describe('PremiumNameRegistry', function () {
    async function deployFixture() {
        const [owner, user1, user2] = await hre.viem.getWalletClients()

        const registry = await hre.viem.deployContract('PremiumNameRegistry', [])

        const publicClient = await hre.viem.getPublicClient()

        return {
            registry,
            owner,
            user1,
            user2,
            publicClient,
        }
    }

    describe('Deployment', function () {
        it('Should deploy successfully', async function () {
            const { registry } = await loadFixture(deployFixture)
            expect(registry.address).to.not.equal(undefined)
        })

        it('Should set owner correctly', async function () {
            const { registry, owner } = await loadFixture(deployFixture)
            const contractOwner = await registry.read.owner()
            expect(contractOwner.toLowerCase()).to.equal(owner.account.address.toLowerCase())
        })
    })

    describe('Add Premium Name', function () {
        it('Should add a premium name for auction', async function () {
            const { registry } = await loadFixture(deployFixture)

            await registry.write.addPremiumName(['bitcoin'])

            const isPremium = await registry.read.isPremium(['bitcoin'])
            expect(isPremium).to.equal(true)
        })

        it('Should return correct premium info for auction name', async function () {
            const { registry } = await loadFixture(deployFixture)

            await registry.write.addPremiumName(['ethereum'])

            const [isPremiumName, requiresAuction, fixedPrice] = await registry.read.getPremiumInfo(['ethereum'])
            expect(isPremiumName).to.equal(true)
            expect(requiresAuction).to.equal(true)
            expect(fixedPrice).to.equal(0n)
        })

        it('Should add premium name with fixed price', async function () {
            const { registry } = await loadFixture(deployFixture)

            const price = 1000n * 10n ** 18n // $1000
            await registry.write.addPremiumNameWithPrice(['gold', price])

            const [isPremiumName, requiresAuction, fixedPrice] = await registry.read.getPremiumInfo(['gold'])
            expect(isPremiumName).to.equal(true)
            expect(requiresAuction).to.equal(false)
            expect(fixedPrice).to.equal(price)
        })

        it('Should revert if non-owner adds premium name', async function () {
            const { registry, user1, publicClient } = await loadFixture(deployFixture)

            // Try calling from user1 who is not owner
            let reverted = false
            try {
                await publicClient.simulateContract({
                    address: registry.address,
                    abi: [{
                        inputs: [{ name: 'name', type: 'string' }],
                        name: 'addPremiumName',
                        outputs: [],
                        stateMutability: 'nonpayable',
                        type: 'function',
                    }],
                    functionName: 'addPremiumName',
                    args: ['test'],
                    account: user1.account.address,
                })
            } catch {
                reverted = true
            }
            expect(reverted).to.equal(true)
        })
    })

    describe('Batch Add Premium Names', function () {
        it('Should batch add premium names', async function () {
            const { registry } = await loadFixture(deployFixture)

            const names = ['a', 'b', 'c', '0', '1', '2']
            await registry.write.addPremiumNamesBatch([names])

            for (const name of names) {
                const isPremium = await registry.read.isPremium([name])
                expect(isPremium).to.equal(true)
            }
        })
    })

    describe('Remove Premium Name', function () {
        it('Should remove a premium name', async function () {
            const { registry } = await loadFixture(deployFixture)

            await registry.write.addPremiumName(['toremove'])
            let isPremium = await registry.read.isPremium(['toremove'])
            expect(isPremium).to.equal(true)

            await registry.write.removePremiumName(['toremove'])
            isPremium = await registry.read.isPremium(['toremove'])
            expect(isPremium).to.equal(false)
        })

        it('Should clear fixed price when removing', async function () {
            const { registry } = await loadFixture(deployFixture)

            const price = 500n * 10n ** 18n
            await registry.write.addPremiumNameWithPrice(['premium', price])
            await registry.write.removePremiumName(['premium'])

            const [, , fixedPrice] = await registry.read.getPremiumInfo(['premium'])
            expect(fixedPrice).to.equal(0n)
        })
    })

    describe('View Functions', function () {
        it('Should return false for non-premium names', async function () {
            const { registry } = await loadFixture(deployFixture)

            const isPremium = await registry.read.isPremium(['randomname12345'])
            expect(isPremium).to.equal(false)
        })

        it('Should return correct info for non-premium names', async function () {
            const { registry } = await loadFixture(deployFixture)

            const [isPremiumName, requiresAuction, fixedPrice] = await registry.read.getPremiumInfo(['notpremium'])
            expect(isPremiumName).to.equal(false)
            expect(requiresAuction).to.equal(false)
            expect(fixedPrice).to.equal(0n)
        })
    })
})
