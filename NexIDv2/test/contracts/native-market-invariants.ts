import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

const launchAuthorizationTypes = {
  LaunchAuthorization: [
    { name: "creator", type: "address" },
    { name: "rulesHash", type: "bytes32" },
    { name: "metadataHash", type: "bytes32" },
    { name: "templateId", type: "bytes32" },
    { name: "closeTime", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
} as const;

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function deployFixture() {
  const [admin, authorizer, creator, traderA, traderB, traderC, traderD, traderE, treasury, rewards, security, p1, p2, p3, p4, p5] = await ethers.getSigners();
  const traders = [traderA, traderB, traderC, traderD, traderE];
  const provers = [p1.address, p2.address, p3.address, p4.address, p5.address];
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const collateral = await MockUSDC.deploy(admin.address);

  const FeeRouter = await ethers.getContractFactory("FeeRouter");
  const feeRouter = await FeeRouter.deploy(admin.address, treasury.address, rewards.address, provers);

  const LaunchStakeVault = await ethers.getContractFactory("LaunchStakeVault");
  const stakeVault = await LaunchStakeVault.deploy(await collateral.getAddress(), admin.address, treasury.address, rewards.address, security.address);

  const ResolutionManager = await ethers.getContractFactory("ResolutionManager");
  const resolutionManager = await ResolutionManager.deploy(admin.address, await stakeVault.getAddress(), 24 * 60 * 60);

  const NativeBinaryMarket = await ethers.getContractFactory("NativeBinaryMarket");
  const marketImplementation = await NativeBinaryMarket.deploy();

  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const marketFactory = await MarketFactory.deploy(
    await collateral.getAddress(),
    await feeRouter.getAddress(),
    await stakeVault.getAddress(),
    await resolutionManager.getAddress(),
    await marketImplementation.getAddress(),
    authorizer.address,
    admin.address,
    200n,
    BigInt(90 * 24 * 60 * 60),
    admin.address
  );

  await stakeVault.grantRole(await stakeVault.FACTORY_ROLE(), await marketFactory.getAddress());
  await stakeVault.grantRole(await stakeVault.RESOLUTION_ROLE(), await resolutionManager.getAddress());
  await feeRouter.setMarketFactory(await marketFactory.getAddress());

  const templateId = ethers.id("token_price_threshold");
  await marketFactory.setTemplateAllowed(templateId, true);
  await collateral.mint(creator.address, ethers.parseUnits("100", 6));
  for (const trader of traders) {
    await collateral.mint(trader.address, ethers.parseUnits("1000", 6));
  }

  return { authorizer, creator, traders, treasury, rewards, security, provers, collateral, feeRouter, stakeVault, resolutionManager, marketFactory, templateId };
}

async function createLiveMarket(fixture: Awaited<ReturnType<typeof deployFixture>>, label: string) {
  const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;
  const rulesHash = ethers.id(`${label}-rules`);
  const metadataHash = ethers.id(`${label}-metadata`);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const nonce = BigInt(ethers.hexlify(ethers.randomBytes(32)));
  const deadline = BigInt(await time.latest()) + BigInt(60 * 60);
  const signature = await fixture.authorizer.signTypedData(
    {
      name: "NexMarketsMarketFactory",
      version: "1",
      chainId,
      verifyingContract: await fixture.marketFactory.getAddress()
    },
    launchAuthorizationTypes,
    {
      creator: fixture.creator.address,
      rulesHash,
      metadataHash,
      templateId: fixture.templateId,
      closeTime,
      nonce,
      deadline
    }
  );
  await fixture.collateral.connect(fixture.creator).approve(await fixture.marketFactory.getAddress(), ethers.parseUnits("20", 6));
  await fixture.marketFactory.connect(fixture.creator).createMarket(rulesHash, metadataHash, fixture.templateId, closeTime, { nonce, deadline, signature });
  const marketAddress = await fixture.marketFactory.markets(0);
  const market = await ethers.getContractAt("NativeBinaryMarket", marketAddress);
  await time.increase(4 * 60);
  for (const trader of fixture.traders) {
    await fixture.collateral.connect(trader).approve(marketAddress, ethers.parseUnits("2000", 6));
  }
  return { market, marketAddress };
}

describe("NexMarkets native market invariants", function () {
  it("keeps randomized buy, fee, and settlement accounting solvent", async function () {
    const fixture = await deployFixture();
    const { market, marketAddress } = await createLiveMarket(fixture, "randomized-settlement");
    const random = lcg(20260527);
    let totalNotional = BigInt(0);
    const rideTraders = new Set<number>();
    const fadeTraders = new Set<number>();

    const firstAmount = ethers.parseUnits("5", 6);
    await market.connect(fixture.traders[0]).buy(0, firstAmount);
    totalNotional += firstAmount;
    rideTraders.add(0);

    for (let i = 0; i < 48; i += 1) {
      const traderIndex = Math.floor(random() * fixture.traders.length);
      const side = random() > 0.5 ? 0 : 1;
      const amount = ethers.parseUnits(String(1 + Math.floor(random() * 12)), 6);
      await market.connect(fixture.traders[traderIndex]).buy(side, amount);
      totalNotional += amount;
      if (side === 0) rideTraders.add(traderIndex);
      else fadeTraders.add(traderIndex);

      expect(await market.collateralPool()).to.equal(totalNotional);
      expect(await fixture.collateral.balanceOf(marketAddress)).to.equal(await market.collateralPool());
    }

    let proverBalancesSum = BigInt(0);
    for (const prover of fixture.provers) {
      proverBalancesSum += await fixture.collateral.balanceOf(prover);
    }

    expect(await fixture.collateral.balanceOf(fixture.creator.address)).to.equal(ethers.parseUnits("80", 6) + (totalNotional * BigInt(100) / BigInt(10_000)));
    expect(await fixture.collateral.balanceOf(fixture.treasury.address)).to.equal(ethers.parseUnits("5", 6) + (totalNotional * BigInt(15) / BigInt(10_000)));
    expect(await fixture.collateral.balanceOf(fixture.rewards.address)).to.equal(ethers.parseUnits("3", 6) + (totalNotional * BigInt(65) / BigInt(10_000)));
    expect(await fixture.collateral.balanceOf(fixture.security.address)).to.equal(ethers.parseUnits("2", 6));
    expect(await fixture.collateral.balanceOf(await fixture.feeRouter.getAddress())).to.equal(totalNotional * BigInt(20) / BigInt(10_000));
    expect(proverBalancesSum).to.equal(0);

    await time.increase(8 * 24 * 60 * 60);
    await fixture.resolutionManager.closeMarket(marketAddress);
    await fixture.resolutionManager.proposeResult(marketAddress, 0);
    await time.increase(24 * 60 * 60 + 1);
    await fixture.resolutionManager.finalizeUndisputed(marketAddress);

    let totalPaid = BigInt(0);
    for (const traderIndex of rideTraders) {
      const trader = fixture.traders[traderIndex];
      const before = await fixture.collateral.balanceOf(trader.address);
      await market.connect(trader).redeem();
      totalPaid += await fixture.collateral.balanceOf(trader.address) - before;
      await expect(market.connect(trader).redeem()).to.be.revertedWith("no winning shares");
    }

    for (const traderIndex of fadeTraders) {
      const trader = fixture.traders[traderIndex];
      await expect(market.connect(trader).redeem()).to.be.revertedWith("no winning shares");
    }

    expect(totalPaid).to.equal(totalNotional);
    expect(await market.collateralPool()).to.equal(0);
    expect(await market.settlementPool()).to.equal(0);
    expect(await fixture.collateral.balanceOf(marketAddress)).to.equal(0);
  });

  it("refunds every randomized invalid-market deposit exactly once", async function () {
    const fixture = await deployFixture();
    const { market, marketAddress } = await createLiveMarket(fixture, "randomized-invalid");
    const random = lcg(10101);
    const refundable = Array.from({ length: fixture.traders.length }, () => [BigInt(0), BigInt(0)]);
    let totalNotional = BigInt(0);

    for (let i = 0; i < 40; i += 1) {
      const traderIndex = Math.floor(random() * fixture.traders.length);
      const side = random() > 0.5 ? 0 : 1;
      const amount = ethers.parseUnits(String(1 + Math.floor(random() * 10)), 6);
      await market.connect(fixture.traders[traderIndex]).buy(side, amount);
      refundable[traderIndex][side] += amount;
      totalNotional += amount;
      expect(await fixture.collateral.balanceOf(marketAddress)).to.equal(totalNotional);
    }

    await time.increase(8 * 24 * 60 * 60);
    await fixture.resolutionManager.closeMarket(marketAddress);
    await fixture.resolutionManager.markInvalid(marketAddress);

    let totalRefunded = BigInt(0);
    for (let traderIndex = 0; traderIndex < fixture.traders.length; traderIndex += 1) {
      for (const side of [0, 1]) {
        const expectedRefund = refundable[traderIndex][side];
        if (expectedRefund === BigInt(0)) continue;
        const trader = fixture.traders[traderIndex];
        const before = await fixture.collateral.balanceOf(trader.address);
        await market.connect(trader).refund(side);
        const refunded = await fixture.collateral.balanceOf(trader.address) - before;
        expect(refunded).to.equal(expectedRefund);
        totalRefunded += refunded;
        await expect(market.connect(trader).refund(side)).to.be.revertedWith("nothing to refund");
      }
    }

    expect(totalRefunded).to.equal(totalNotional);
    expect(await market.collateralPool()).to.equal(0);
    expect(await fixture.collateral.balanceOf(marketAddress)).to.equal(0);
  });
});
