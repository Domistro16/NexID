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

async function signLaunchAuthorization(input: {
  marketFactory: any;
  authorizer: any;
  creator: string;
  rulesHash: string;
  metadataHash: string;
  templateId: string;
  closeTime: number;
}) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const nonce = BigInt(ethers.hexlify(ethers.randomBytes(32)));
  const deadline = BigInt(await time.latest()) + BigInt(60 * 60);
  const signature = await input.authorizer.signTypedData(
    {
      name: "NexMarketsMarketFactory",
      version: "1",
      chainId,
      verifyingContract: await input.marketFactory.getAddress()
    },
    launchAuthorizationTypes,
    {
      creator: input.creator,
      rulesHash: input.rulesHash,
      metadataHash: input.metadataHash,
      templateId: input.templateId,
      closeTime: input.closeTime,
      nonce,
      deadline
    }
  );
  return { nonce, deadline, signature };
}

describe("NexMarkets native market contracts", function () {
  async function deployFixture() {
    const [admin, authorizer, creator, trader, traderTwo, treasury, rewards, security] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const collateral = await MockUSDC.deploy(admin.address);

    const FeeRouter = await ethers.getContractFactory("FeeRouter");
    const feeRouter = await FeeRouter.deploy(admin.address, treasury.address, rewards.address, security.address);

    const LaunchStakeVault = await ethers.getContractFactory("LaunchStakeVault");
    const stakeVault = await LaunchStakeVault.deploy(await collateral.getAddress(), admin.address, treasury.address, rewards.address, security.address);

    const ResolutionManager = await ethers.getContractFactory("ResolutionManager");
    const resolutionManager = await ResolutionManager.deploy(admin.address, await stakeVault.getAddress(), 24 * 60 * 60);

    const MarketFactory = await ethers.getContractFactory("MarketFactory");
    const marketFactory = await MarketFactory.deploy(
      await collateral.getAddress(),
      await feeRouter.getAddress(),
      await stakeVault.getAddress(),
      await resolutionManager.getAddress(),
      authorizer.address,
      admin.address
    );

    await stakeVault.grantRole(await stakeVault.FACTORY_ROLE(), await marketFactory.getAddress());
    await stakeVault.grantRole(await stakeVault.RESOLUTION_ROLE(), await resolutionManager.getAddress());

    const templateId = ethers.id("token_price_threshold");
    await marketFactory.setTemplateAllowed(templateId, true);
    await collateral.mint(creator.address, ethers.parseUnits("100", 6));
    await collateral.mint(trader.address, ethers.parseUnits("100", 6));
    await collateral.mint(traderTwo.address, ethers.parseUnits("100", 6));

    return { admin, authorizer, creator, trader, traderTwo, treasury, rewards, security, collateral, feeRouter, stakeVault, resolutionManager, marketFactory, templateId };
  }

  async function createMarketWithAuthorization(fixture: Awaited<ReturnType<typeof deployFixture>>, rulesHash: string, metadataHash: string, closeTime: number) {
    const authorization = await signLaunchAuthorization({
      marketFactory: fixture.marketFactory,
      authorizer: fixture.authorizer,
      creator: fixture.creator.address,
      rulesHash,
      metadataHash,
      templateId: fixture.templateId,
      closeTime
    });
    return fixture.marketFactory.connect(fixture.creator).createMarket(
      rulesHash,
      metadataHash,
      fixture.templateId,
      closeTime,
      authorization
    );
  }

  it("requires signed launch authorization and blocks duplicate rules hashes", async function () {
    const { authorizer, creator, trader, collateral, marketFactory, templateId } = await deployFixture();
    const rulesHash = ethers.id("hype-hits-50-june-30");
    const metadataHash = ethers.id("metadata-v1");
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;
    const authorization = await signLaunchAuthorization({
      marketFactory,
      authorizer,
      creator: creator.address,
      rulesHash,
      metadataHash,
      templateId,
      closeTime
    });

    await expect(marketFactory.connect(trader).createMarket(
      rulesHash,
      metadataHash,
      templateId,
      closeTime,
      authorization
    )).to.be.revertedWith("bad launch authorization");

    await collateral.connect(creator).approve(await marketFactory.getAddress(), ethers.parseUnits("40", 6));
    await expect(marketFactory.connect(creator).createMarket(
      rulesHash,
      metadataHash,
      templateId,
      closeTime,
      authorization
    )).to.emit(marketFactory, "MarketCreated");

    const duplicateAuthorization = await signLaunchAuthorization({
      marketFactory,
      authorizer,
      creator: creator.address,
      rulesHash,
      metadataHash,
      templateId,
      closeTime
    });
    await expect(marketFactory.connect(creator).createMarket(
      rulesHash,
      metadataHash,
      templateId,
      closeTime,
      duplicateAuthorization
    )).to.be.revertedWith("duplicate rules hash");
  });

  it("splits launch stake and native trading fees", async function () {
    const fixture = await deployFixture();
    const { creator, trader, treasury, rewards, security, collateral, marketFactory, templateId } = fixture;
    const rulesHash = ethers.id("bankr-vs-virtuals-7-day");
    const metadataHash = ethers.id("metadata-v2");
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;

    await collateral.connect(creator).approve(await marketFactory.getAddress(), ethers.parseUnits("20", 6));
    await createMarketWithAuthorization(fixture, rulesHash, metadataHash, closeTime);

    expect(await collateral.balanceOf(treasury.address)).to.equal(ethers.parseUnits("5", 6));
    expect(await collateral.balanceOf(rewards.address)).to.equal(ethers.parseUnits("3", 6));
    expect(await collateral.balanceOf(security.address)).to.equal(ethers.parseUnits("2", 6));

    const marketAddress = await marketFactory.markets(0);
    const market = await ethers.getContractAt("NativeBinaryMarket", marketAddress);

    await time.increase(4 * 60);
    await collateral.connect(trader).approve(marketAddress, ethers.parseUnits("10.2", 6));
    const quote = await market.quoteBuy(0, ethers.parseUnits("10", 6));
    expect(quote[2]).to.equal(5000);
    expect(quote[1]).to.equal(ethers.parseUnits("20", 6));
    await market.connect(trader).buy(0, ethers.parseUnits("10", 6));

    expect(await collateral.balanceOf(creator.address)).to.equal(ethers.parseUnits("80.1", 6));
    expect(await collateral.balanceOf(treasury.address)).to.equal(ethers.parseUnits("5.06", 6));
    expect(await collateral.balanceOf(rewards.address)).to.equal(ethers.parseUnits("3.02", 6));
    expect(await collateral.balanceOf(security.address)).to.equal(ethers.parseUnits("2.02", 6));
  });

  it("settles winning shares without over-redemption", async function () {
    const fixture = await deployFixture();
    const { creator, trader, traderTwo, collateral, marketFactory, resolutionManager } = fixture;
    const rulesHash = ethers.id("settlement-accounting");
    const metadataHash = ethers.id("metadata-settlement");
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;

    await collateral.connect(creator).approve(await marketFactory.getAddress(), ethers.parseUnits("20", 6));
    await createMarketWithAuthorization(fixture, rulesHash, metadataHash, closeTime);
    const marketAddress = await marketFactory.markets(0);
    const market = await ethers.getContractAt("NativeBinaryMarket", marketAddress);

    await time.increase(4 * 60);
    await collateral.connect(trader).approve(marketAddress, ethers.parseUnits("10.2", 6));
    await collateral.connect(traderTwo).approve(marketAddress, ethers.parseUnits("30.6", 6));
    await market.connect(trader).buy(0, ethers.parseUnits("10", 6));
    await market.connect(traderTwo).buy(0, ethers.parseUnits("30", 6));

    await time.increase(8 * 24 * 60 * 60);
    await resolutionManager.closeMarket(marketAddress);
    await resolutionManager.proposeResult(marketAddress, 0);
    await time.increase(24 * 60 * 60 + 1);
    const creatorBeforeFinalize = await collateral.balanceOf(creator.address);
    await resolutionManager.finalizeUndisputed(marketAddress);
    expect(await collateral.balanceOf(creator.address) - creatorBeforeFinalize).to.equal(ethers.parseUnits("10", 6));

    const beforeOne = await collateral.balanceOf(trader.address);
    const beforeTwo = await collateral.balanceOf(traderTwo.address);
    await market.connect(trader).redeem();
    await market.connect(traderTwo).redeem();
    const payoutOne = (await collateral.balanceOf(trader.address)) - beforeOne;
    const payoutTwo = (await collateral.balanceOf(traderTwo.address)) - beforeTwo;
    expect(payoutOne + payoutTwo).to.equal(ethers.parseUnits("40", 6));
    expect(await market.settlementPool()).to.equal(0);
    expect(await market.collateralPool()).to.equal(0);
    await expect(market.connect(trader).redeem()).to.be.revertedWith("no winning shares");
  });

  it("refunds invalid markets from tracked collateral, not share units", async function () {
    const fixture = await deployFixture();
    const { creator, trader, security, collateral, marketFactory, resolutionManager } = fixture;
    const rulesHash = ethers.id("invalid-refund-accounting");
    const metadataHash = ethers.id("metadata-invalid-refund");
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;

    await collateral.connect(creator).approve(await marketFactory.getAddress(), ethers.parseUnits("20", 6));
    await createMarketWithAuthorization(fixture, rulesHash, metadataHash, closeTime);
    const marketAddress = await marketFactory.markets(0);
    const market = await ethers.getContractAt("NativeBinaryMarket", marketAddress);

    await time.increase(4 * 60);
    await collateral.connect(trader).approve(marketAddress, ethers.parseUnits("10.2", 6));
    await market.connect(trader).buy(0, ethers.parseUnits("10", 6));
    await time.increase(8 * 24 * 60 * 60);
    await resolutionManager.closeMarket(marketAddress);
    const securityBefore = await collateral.balanceOf(security.address);
    await resolutionManager.markInvalid(marketAddress);
    expect(await collateral.balanceOf(security.address) - securityBefore).to.equal(ethers.parseUnits("10", 6));

    const before = await collateral.balanceOf(trader.address);
    await market.connect(trader).refund(0);
    expect(await collateral.balanceOf(trader.address) - before).to.equal(ethers.parseUnits("10", 6));
    await expect(market.connect(trader).refund(0)).to.be.revertedWith("nothing to refund");
  });

  it("applies exposure caps only during the first hour after open", async function () {
    const fixture = await deployFixture();
    const { creator, trader, collateral, marketFactory } = fixture;
    const rulesHash = ethers.id("first-hour-exposure-cap");
    const metadataHash = ethers.id("metadata-exposure-cap");
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;

    await marketFactory.setFactoryLimits(60, ethers.parseUnits("10", 6));
    await collateral.connect(creator).approve(await marketFactory.getAddress(), ethers.parseUnits("20", 6));
    await createMarketWithAuthorization(fixture, rulesHash, metadataHash, closeTime);
    const marketAddress = await marketFactory.markets(0);
    const market = await ethers.getContractAt("NativeBinaryMarket", marketAddress);

    await collateral.connect(trader).approve(marketAddress, ethers.parseUnits("30", 6));
    await time.increase(61);
    await expect(market.connect(trader).buy(0, ethers.parseUnits("11", 6))).to.be.revertedWith("exposure cap");

    await time.increase(60 * 60);
    await expect(market.connect(trader).buy(0, ethers.parseUnits("11", 6))).to.emit(market, "TradeExecuted");
  });
});
