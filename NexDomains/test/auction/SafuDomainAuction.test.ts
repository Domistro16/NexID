import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'
import { parseEther, parseUnits, zeroAddress } from 'viem'

describe('IDDomainAuction', function () {
    async function deployFullFixture() {
        const [owner, bidder1, bidder2, treasury] = await hre.viem.getWalletClients()

        // Deploy mock USDC (6 decimals)
        const mockUSDC = await hre.viem.deployContract('MockERC20', ['USDC', 'USDC', 6n])

        // Mint USDC to bidders
        await mockUSDC.write.mint([bidder1.account.address, parseUnits('10000', 6)])
        await mockUSDC.write.mint([bidder2.account.address, parseUnits('10000', 6)])

        // Deploy ENS Registry
        const ensRegistry = await hre.viem.deployContract('ENSRegistry', [])

        // Deploy Base Registrar
        const baseRegistrar = await hre.viem.deployContract('BaseRegistrarImplementation', [
            ensRegistry.address,
            '0xe3f6fa8ec34a0592261cf8313365d7f76784e190d0c33fbd4d51f8461a9b8e54', // id namehash
        ])

        // Deploy NameWrapper (simplified - may need actual dependencies)
        // For auction tests, we'll use a mock
        const mockNameWrapper = await hre.viem.deployContract('MockNameWrapper', [])

        // Deploy Public Resolver mock
        const mockResolver = await hre.viem.deployContract('MockResolver', [])

        // Deploy IDDomainAuction
        const auction = await hre.viem.deployContract('IDDomainAuction', [
            mockNameWrapper.address,
            mockResolver.address,
            mockUSDC.address,
            treasury.account.address,
        ])

        const publicClient = await hre.viem.getPublicClient()

        // Constants
        const ONE_DAY = 86400n
        const ONE_WEEK = ONE_DAY * 7n

        return {
            auction,
            mockUSDC,
            mockNameWrapper,
            mockResolver,
            ensRegistry,
            baseRegistrar,
            owner,
            bidder1,
            bidder2,
            treasury,
            publicClient,
            ONE_DAY,
            ONE_WEEK,
        }
    }

    // Simplified fixture without full ENS deployment
    async function deployAuctionOnlyFixture() {
        const [owner, bidder1, bidder2, treasury] = await hre.viem.getWalletClients()

        // Deploy mock contracts
        const mockUSDC = await hre.viem.deployContract('MockERC20', ['USDC', 'USDC', 6n])
        const mockNameWrapper = await hre.viem.deployContract('MockNameWrapper', [])
        const mockResolver = await hre.viem.deployContract('MockResolver', [])

        // Mint USDC to bidders
        await mockUSDC.write.mint([bidder1.account.address, parseUnits('10000', 6)])
        await mockUSDC.write.mint([bidder2.account.address, parseUnits('10000', 6)])

        // Deploy IDDomainAuction
        const auction = await hre.viem.deployContract('IDDomainAuction', [
            mockNameWrapper.address,
            mockResolver.address,
            mockUSDC.address,
            treasury.account.address,
        ])

        // Approve USDC spending for bidders
        const usdcAsBidder1 = await hre.viem.getContractAt('MockERC20', mockUSDC.address, { client: bidder1 })
        const usdcAsBidder2 = await hre.viem.getContractAt('MockERC20', mockUSDC.address, { client: bidder2 })
        await usdcAsBidder1.write.approve([auction.address, parseUnits('10000', 6)])
        await usdcAsBidder2.write.approve([auction.address, parseUnits('10000', 6)])

        const publicClient = await hre.viem.getPublicClient()
        const ONE_DAY = 86400n
        const ONE_WEEK = ONE_DAY * 7n

        return {
            auction,
            mockUSDC,
            mockNameWrapper,
            mockResolver,
            owner,
            bidder1,
            bidder2,
            treasury,
            publicClient,
            ONE_DAY,
            ONE_WEEK,
        }
    }

    describe('Deployment', function () {
        it('Should deploy successfully', async function () {
            const { auction } = await loadFixture(deployAuctionOnlyFixture)
            expect(auction.address).to.be.properAddress
        })

        it('Should start with auctionId 1', async function () {
            const { auction } = await loadFixture(deployAuctionOnlyFixture)
            const nextId = await auction.read.nextAuctionId()
            expect(nextId).to.equal(1n)
        })
    })

    describe('Create Auction', function () {
        it('Should create an ETH auction', async function () {
            const { auction, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            const reservePrice = parseEther('0.1')
            await auction.write.createAuction(['bitcoin', reservePrice, ONE_DAY, false])

            const nextId = await auction.read.nextAuctionId()
            expect(nextId).to.equal(2n)

            const auctionData = await auction.read.getAuction([1n])
            expect(auctionData[0]).to.equal('bitcoin') // name
            expect(auctionData[1]).to.equal(reservePrice) // reservePrice
            expect(auctionData[7]).to.equal(false) // isUSDC
        })

        it('Should create a USDC auction', async function () {
            const { auction, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            const reservePrice = parseUnits('100', 6) // $100 USDC
            await auction.write.createAuction(['ethereum', reservePrice, ONE_DAY, true])

            const auctionData = await auction.read.getAuction([1n])
            expect(auctionData[0]).to.equal('ethereum')
            expect(auctionData[1]).to.equal(reservePrice)
            expect(auctionData[7]).to.equal(true) // isUSDC
        })

        it('Should revert if duration too short', async function () {
            const { auction } = await loadFixture(deployAuctionOnlyFixture)

            await expect(
                auction.write.createAuction(['short', parseEther('0.1'), 3600n, false]) // 1 hour
            ).to.be.rejectedWith('DurationTooShort')
        })

        it('Should revert if non-owner creates auction', async function () {
            const { auction, bidder1, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            const auctionAsBidder = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })

            await expect(
                auctionAsBidder.write.createAuction(['test', parseEther('0.1'), ONE_DAY, false])
            ).to.be.rejectedWith('OwnableUnauthorizedAccount')
        })
    })

    describe('Bidding (ETH)', function () {
        it('Should accept a bid meeting reserve price', async function () {
            const { auction, bidder1, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            const reservePrice = parseEther('0.1')
            await auction.write.createAuction(['test', reservePrice, ONE_DAY, false])

            const auctionAsBidder = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })
            await auctionAsBidder.write.bid([1n], { value: reservePrice })

            const auctionData = await auction.read.getAuction([1n])
            expect(auctionData[4]).to.equal(reservePrice) // highestBid
            expect(auctionData[5].toLowerCase()).to.equal(bidder1.account.address.toLowerCase()) // highestBidder
        })

        it('Should reject bid below reserve', async function () {
            const { auction, bidder1, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            await auction.write.createAuction(['test', parseEther('1'), ONE_DAY, false])

            const auctionAsBidder = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })

            await expect(
                auctionAsBidder.write.bid([1n], { value: parseEther('0.5') })
            ).to.be.rejectedWith('BidTooLow')
        })

        it('Should outbid previous bidder', async function () {
            const { auction, bidder1, bidder2, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            const reservePrice = parseEther('0.1')
            await auction.write.createAuction(['test', reservePrice, ONE_DAY, false])

            // First bid
            const auctionAsBidder1 = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })
            await auctionAsBidder1.write.bid([1n], { value: reservePrice })

            // Get minimum bid for next
            const minBid = await auction.read.getMinBid([1n])

            // Second bid (higher)
            const auctionAsBidder2 = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder2 })
            await auctionAsBidder2.write.bid([1n], { value: minBid })

            const auctionData = await auction.read.getAuction([1n])
            expect(auctionData[5].toLowerCase()).to.equal(bidder2.account.address.toLowerCase())
        })

        it('Should set pending returns for outbid bidder', async function () {
            const { auction, bidder1, bidder2, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            const reservePrice = parseEther('0.1')
            await auction.write.createAuction(['test', reservePrice, ONE_DAY, false])

            // First bid
            const auctionAsBidder1 = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })
            await auctionAsBidder1.write.bid([1n], { value: reservePrice })

            // Get minimum bid for next
            const minBid = await auction.read.getMinBid([1n])

            // Second bid
            const auctionAsBidder2 = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder2 })
            await auctionAsBidder2.write.bid([1n], { value: minBid })

            // Check pending returns
            const pendingReturn = await auction.read.pendingReturns([bidder1.account.address, 1n])
            expect(pendingReturn).to.equal(reservePrice)
        })
    })

    describe('Bidding (USDC)', function () {
        it('Should accept USDC bid meeting reserve', async function () {
            const { auction, bidder1, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            const reservePrice = parseUnits('100', 6) // $100
            await auction.write.createAuction(['usdc-test', reservePrice, ONE_DAY, true])

            const auctionAsBidder = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })
            await auctionAsBidder.write.bidUSDC([1n, reservePrice])

            const auctionData = await auction.read.getAuction([1n])
            expect(auctionData[4]).to.equal(reservePrice)
            expect(auctionData[5].toLowerCase()).to.equal(bidder1.account.address.toLowerCase())
        })

        it('Should reject USDC bid on ETH auction', async function () {
            const { auction, bidder1, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            await auction.write.createAuction(['eth-only', parseEther('0.1'), ONE_DAY, false])

            const auctionAsBidder = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })

            await expect(
                auctionAsBidder.write.bidUSDC([1n, parseUnits('100', 6)])
            ).to.be.rejectedWith('WrongPaymentType')
        })
    })

    describe('Anti-Sniping', function () {
        it('Should extend auction if bid in last 10 minutes', async function () {
            const { auction, bidder1, ONE_DAY, publicClient } = await loadFixture(deployAuctionOnlyFixture)

            await auction.write.createAuction(['snipe-test', parseEther('0.1'), ONE_DAY, false])

            const auctionData = await auction.read.getAuction([1n])
            const originalEndTime = auctionData[3]

            // Fast forward to 5 minutes before end
            await time.increase(Number(ONE_DAY) - 300)

            // Place bid
            const auctionAsBidder = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })
            await auctionAsBidder.write.bid([1n], { value: parseEther('0.1') })

            // Check end time extended
            const newAuctionData = await auction.read.getAuction([1n])
            expect(newAuctionData[3]).to.be.gt(originalEndTime)
        })
    })

    describe('Settlement', function () {
        it('Should settle auction after end time', async function () {
            const { auction, bidder1, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            await auction.write.createAuction(['settle-test', parseEther('0.1'), ONE_DAY, false])

            // Place bid
            const auctionAsBidder = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })
            await auctionAsBidder.write.bid([1n], { value: parseEther('0.1') })

            // Fast forward past end
            await time.increase(Number(ONE_DAY) + 1)

            // Settle
            await auction.write.settle([1n])

            const auctionData = await auction.read.getAuction([1n])
            expect(auctionData[6]).to.be.true // settled
        })

        it('Should reject settlement before end time', async function () {
            const { auction, bidder1, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            await auction.write.createAuction(['early-settle', parseEther('0.1'), ONE_DAY, false])

            const auctionAsBidder = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })
            await auctionAsBidder.write.bid([1n], { value: parseEther('0.1') })

            await expect(
                auction.write.settle([1n])
            ).to.be.rejectedWith('AuctionNotEnded')
        })

        it('Should reject double settlement', async function () {
            const { auction, bidder1, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            await auction.write.createAuction(['double-settle', parseEther('0.1'), ONE_DAY, false])

            const auctionAsBidder = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })
            await auctionAsBidder.write.bid([1n], { value: parseEther('0.1') })

            await time.increase(Number(ONE_DAY) + 1)
            await auction.write.settle([1n])

            await expect(
                auction.write.settle([1n])
            ).to.be.rejectedWith('AuctionAlreadySettled')
        })
    })

    describe('Cancel Auction', function () {
        it('Should cancel auction with no bids', async function () {
            const { auction, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            await auction.write.createAuction(['cancel-test', parseEther('0.1'), ONE_DAY, false])
            await auction.write.cancelAuction([1n])

            const auctionData = await auction.read.getAuction([1n])
            expect(auctionData[6]).to.be.true // settled (cancelled)
        })

        it('Should reject cancel if has bids', async function () {
            const { auction, bidder1, ONE_DAY } = await loadFixture(deployAuctionOnlyFixture)

            await auction.write.createAuction(['no-cancel', parseEther('0.1'), ONE_DAY, false])

            const auctionAsBidder = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })
            await auctionAsBidder.write.bid([1n], { value: parseEther('0.1') })

            await expect(
                auction.write.cancelAuction([1n])
            ).to.be.rejectedWith('HasBids')
        })
    })

    describe('Withdraw', function () {
        it('Should allow outbid user to withdraw', async function () {
            const { auction, bidder1, bidder2, ONE_DAY, publicClient } = await loadFixture(deployAuctionOnlyFixture)

            await auction.write.createAuction(['withdraw-test', parseEther('0.1'), ONE_DAY, false])

            // First bid
            const auctionAsBidder1 = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder1 })
            await auctionAsBidder1.write.bid([1n], { value: parseEther('0.1') })

            // Outbid
            const auctionAsBidder2 = await hre.viem.getContractAt('IDDomainAuction', auction.address, { client: bidder2 })
            const minBid = await auction.read.getMinBid([1n])
            await auctionAsBidder2.write.bid([1n], { value: minBid })

            // Get balance before
            const balanceBefore = await publicClient.getBalance({ address: bidder1.account.address })

            // Withdraw
            await auctionAsBidder1.write.withdraw([1n])

            // Check pending returns cleared
            const pendingReturn = await auction.read.pendingReturns([bidder1.account.address, 1n])
            expect(pendingReturn).to.equal(0n)
        })
    })
})
