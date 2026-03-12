import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { namehash, labelhash } from 'viem/ens'

describe('Royalty (ERC-2981)', function () {
    /**
     * Deploy BaseRegistrarImplementation with royalty support
     */
    async function deployBaseRegistrarFixture() {
        const [owner, treasury, user1] = await hre.viem.getWalletClients()

        // Deploy ENS Registry
        const registry = await hre.viem.deployContract('ENSRegistry', [])

        // Calculate id namehash
        const safuNamehash = namehash('id')

        // Deploy Base Registrar
        const baseRegistrar = await hre.viem.deployContract('BaseRegistrarImplementation', [
            registry.address,
            safuNamehash,
        ])

        // Set up registry
        await registry.write.setSubnodeOwner([
            '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
            labelhash('id'),
            baseRegistrar.address,
        ])

        const publicClient = await hre.viem.getPublicClient()

        return {
            registry,
            baseRegistrar,
            owner,
            treasury,
            user1,
            publicClient,
        }
    }

    /**
     * Deploy NameWrapper with royalty support
     */
    async function deployNameWrapperFixture() {
        const [owner, treasury, user1] = await hre.viem.getWalletClients()

        // Deploy ENS Registry
        const registry = await hre.viem.deployContract('ENSRegistry', [])

        const safuNamehash = namehash('id')

        // Deploy Base Registrar
        const baseRegistrar = await hre.viem.deployContract('BaseRegistrarImplementation', [
            registry.address,
            safuNamehash,
        ])

        // Deploy StaticMetadataService
        const metadataService = await hre.viem.deployContract('StaticMetadataService', [
            'https://metadata.id.domains/',
        ])

        // Deploy NameWrapper
        const nameWrapper = await hre.viem.deployContract('NameWrapper', [
            registry.address,
            baseRegistrar.address,
            metadataService.address,
        ])

        const publicClient = await hre.viem.getPublicClient()

        return {
            registry,
            baseRegistrar,
            nameWrapper,
            metadataService,
            owner,
            treasury,
            user1,
            publicClient,
        }
    }

    describe('BaseRegistrarImplementation Royalty', function () {
        it('Should implement ERC-2981', async function () {
            const { baseRegistrar } = await loadFixture(deployBaseRegistrarFixture)

            // Check supportsInterface for ERC-2981
            const supportsRoyalty = await baseRegistrar.read.supportsInterface(['0x2a55205a'])
            expect(supportsRoyalty).to.be.true
        })

        it('Should return 5% royalty by default', async function () {
            const { baseRegistrar, owner } = await loadFixture(deployBaseRegistrarFixture)

            const salePrice = 1000000000000000000n // 1 ETH
            const [receiver, royaltyAmount] = await baseRegistrar.read.royaltyInfo([1n, salePrice])

            // 5% = 500 basis points
            const expectedRoyalty = salePrice * 500n / 10000n
            expect(royaltyAmount).to.equal(expectedRoyalty)
        })

        it('Should set royalty receiver', async function () {
            const { baseRegistrar, treasury } = await loadFixture(deployBaseRegistrarFixture)

            // Set royalty receiver
            await baseRegistrar.write.setRoyaltyReceiver([treasury.account.address])

            const salePrice = 1000000000000000000n
            const [receiver] = await baseRegistrar.read.royaltyInfo([1n, salePrice])

            expect(receiver.toLowerCase()).to.equal(treasury.account.address.toLowerCase())
        })

        it('Should only allow owner to set royalty receiver', async function () {
            const { baseRegistrar, user1, treasury } = await loadFixture(deployBaseRegistrarFixture)

            const registrarAsUser = await hre.viem.getContractAt(
                'BaseRegistrarImplementation',
                baseRegistrar.address,
                { client: user1 }
            )

            await expect(
                registrarAsUser.write.setRoyaltyReceiver([treasury.account.address])
            ).to.be.rejectedWith('Ownable')
        })
    })

    describe('NameWrapper Royalty', function () {
        it('Should implement ERC-2981', async function () {
            const { nameWrapper } = await loadFixture(deployNameWrapperFixture)

            // Check supportsInterface for ERC-2981
            const supportsRoyalty = await nameWrapper.read.supportsInterface(['0x2a55205a'])
            expect(supportsRoyalty).to.be.true
        })

        it('Should return 5% royalty by default', async function () {
            const { nameWrapper } = await loadFixture(deployNameWrapperFixture)

            const salePrice = 2000000000000000000n // 2 ETH
            const tokenId = BigInt(namehash('test.id'))
            const [receiver, royaltyAmount] = await nameWrapper.read.royaltyInfo([tokenId, salePrice])

            // 5% = 500 basis points
            const expectedRoyalty = salePrice * 500n / 10000n
            expect(royaltyAmount).to.equal(expectedRoyalty)
        })

        it('Should set royalty receiver', async function () {
            const { nameWrapper, treasury } = await loadFixture(deployNameWrapperFixture)

            await nameWrapper.write.setRoyaltyReceiver([treasury.account.address])

            const salePrice = 1000000000000000000n
            const tokenId = BigInt(namehash('test.id'))
            const [receiver] = await nameWrapper.read.royaltyInfo([tokenId, salePrice])

            expect(receiver.toLowerCase()).to.equal(treasury.account.address.toLowerCase())
        })

        it('Should only allow owner to set royalty receiver', async function () {
            const { nameWrapper, user1, treasury } = await loadFixture(deployNameWrapperFixture)

            const wrapperAsUser = await hre.viem.getContractAt(
                'NameWrapper',
                nameWrapper.address,
                { client: user1 }
            )

            await expect(
                wrapperAsUser.write.setRoyaltyReceiver([treasury.account.address])
            ).to.be.rejectedWith('Ownable')
        })
    })

    describe('Royalty Calculation', function () {
        it('Should calculate correct royalty for various sale prices', async function () {
            const { baseRegistrar } = await loadFixture(deployBaseRegistrarFixture)

            const testCases = [
                { salePrice: 100n, expected: 5n },
                { salePrice: 1000n, expected: 50n },
                { salePrice: 10000n, expected: 500n },
                { salePrice: 1000000000000000000n, expected: 50000000000000000n }, // 1 ETH -> 0.05 ETH
            ]

            for (const { salePrice, expected } of testCases) {
                const [, royaltyAmount] = await baseRegistrar.read.royaltyInfo([1n, salePrice])
                expect(royaltyAmount).to.equal(expected)
            }
        })

        it('Should return 0 royalty for 0 sale price', async function () {
            const { baseRegistrar } = await loadFixture(deployBaseRegistrarFixture)

            const [, royaltyAmount] = await baseRegistrar.read.royaltyInfo([1n, 0n])
            expect(royaltyAmount).to.equal(0n)
        })
    })
})
