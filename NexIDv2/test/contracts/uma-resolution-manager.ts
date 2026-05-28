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

async function deployFixture() {
  const [admin, authorizer, creator, trader, treasury, rewards, security] = await ethers.getSigners();
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const collateral = await MockUSDC.deploy(admin.address);

  const FeeRouter = await ethers.getContractFactory("FeeRouter");
  const feeRouter = await FeeRouter.deploy(admin.address, treasury.address, rewards.address, security.address);

  const LaunchStakeVault = await ethers.getContractFactory("LaunchStakeVault");
  const stakeVault = await LaunchStakeVault.deploy(await collateral.getAddress(), admin.address, treasury.address, rewards.address, security.address);

  const MockOptimisticOracleV3 = await ethers.getContractFactory("MockOptimisticOracleV3");
  const optimisticOracle = await MockOptimisticOracleV3.deploy(ethers.parseUnits("1", 6));

  const UmaResolutionManager = await ethers.getContractFactory("UmaResolutionManager");
  const resolutionManager = await UmaResolutionManager.deploy(
    admin.address,
    await stakeVault.getAddress(),
    await optimisticOracle.getAddress(),
    await collateral.getAddress(),
    2 * 60 * 60
  );

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

  const templateId = ethers.id("sports_result");
  await marketFactory.setTemplateAllowed(templateId, true);
  await collateral.mint(admin.address, ethers.parseUnits("10", 6));
  await collateral.mint(creator.address, ethers.parseUnits("100", 6));
  await collateral.mint(trader.address, ethers.parseUnits("100", 6));

  return { admin, authorizer, creator, trader, security, collateral, stakeVault, optimisticOracle, resolutionManager, marketFactory, templateId };
}

async function createMarket(fixture: Awaited<ReturnType<typeof deployFixture>>, label: string) {
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
  await fixture.collateral.connect(fixture.trader).approve(marketAddress, ethers.parseUnits("20.4", 6));
  await market.connect(fixture.trader).buy(0, ethers.parseUnits("20", 6));
  await time.increase(8 * 24 * 60 * 60);
  await fixture.resolutionManager.closeMarket(marketAddress);
  return { market, marketAddress };
}

async function assertMarketResult(
  fixture: Awaited<ReturnType<typeof deployFixture>>,
  marketAddress: string,
  winner: number,
  invalid: boolean,
  claim: string
) {
  const claimBytes = ethers.toUtf8Bytes(claim);
  await fixture.collateral.connect(fixture.admin).approve(await fixture.resolutionManager.getAddress(), ethers.parseUnits("1", 6));
  const assertionId = await fixture.resolutionManager.connect(fixture.admin).assertMarketResult.staticCall(marketAddress, winner, invalid, claimBytes);
  await expect(fixture.resolutionManager.connect(fixture.admin).assertMarketResult(marketAddress, winner, invalid, claimBytes))
    .to.emit(fixture.resolutionManager, "MarketResultAsserted");
  return assertionId;
}

describe("NexMarkets UMA resolution manager", function () {
  it("settles a truthful UMA assertion and returns the creator bond", async function () {
    const fixture = await deployFixture();
    const { market, marketAddress } = await createMarket(fixture, "uma-truthful-settlement");
    const creatorBefore = await fixture.collateral.balanceOf(fixture.creator.address);
    const assertionId = await assertMarketResult(
      fixture,
      marketAddress,
      0,
      false,
      "NexMarkets market resolves Ride using the official result source named in the locked rules."
    );

    await expect(fixture.resolutionManager.settleAssertion(assertionId))
      .to.emit(fixture.resolutionManager, "MarketResultResolved")
      .withArgs(marketAddress, assertionId, true, false);

    expect(await market.status()).to.equal(5);
    expect(await fixture.collateral.balanceOf(fixture.creator.address) - creatorBefore).to.equal(ethers.parseUnits("10", 6));
  });

  it("slashes the creator bond and opens refunds when UMA validates an invalid market", async function () {
    const fixture = await deployFixture();
    const { market, marketAddress } = await createMarket(fixture, "uma-invalid-market");
    const securityBefore = await fixture.collateral.balanceOf(fixture.security.address);
    const assertionId = await assertMarketResult(
      fixture,
      marketAddress,
      0,
      true,
      "NexMarkets market is invalid because the locked source cannot objectively resolve the question."
    );

    await fixture.resolutionManager.settleAssertion(assertionId);

    expect(await market.status()).to.equal(6);
    expect(await fixture.collateral.balanceOf(fixture.security.address) - securityBefore).to.equal(ethers.parseUnits("10", 6));

    const traderBefore = await fixture.collateral.balanceOf(fixture.trader.address);
    await market.connect(fixture.trader).refund(0);
    expect(await fixture.collateral.balanceOf(fixture.trader.address) - traderBefore).to.equal(ethers.parseUnits("20", 6));
  });

  it("does not finalize the market when UMA rejects the assertion", async function () {
    const fixture = await deployFixture();
    const { market, marketAddress } = await createMarket(fixture, "uma-false-assertion");
    const assertionId = await assertMarketResult(
      fixture,
      marketAddress,
      1,
      false,
      "NexMarkets market resolves Fade using the official result source named in the locked rules."
    );
    await fixture.optimisticOracle.setAssertionResult(assertionId, false);

    await fixture.resolutionManager.settleAssertion(assertionId);

    expect(await market.status()).to.equal(2);
    expect(await fixture.resolutionManager.activeAssertionByMarket(marketAddress)).to.equal(ethers.ZeroHash);
  });

  it("records UMA disputes without finalizing until the oracle resolves", async function () {
    const fixture = await deployFixture();
    const { market, marketAddress } = await createMarket(fixture, "uma-disputed-assertion");
    const assertionId = await assertMarketResult(
      fixture,
      marketAddress,
      0,
      false,
      "NexMarkets market resolves Ride after the official result source confirms the outcome."
    );

    await expect(fixture.optimisticOracle.disputeAssertion(assertionId))
      .to.emit(fixture.resolutionManager, "MarketResultDisputed")
      .withArgs(marketAddress, assertionId);
    expect((await fixture.resolutionManager.assertions(assertionId)).disputed).to.equal(true);
    expect(await market.status()).to.equal(2);
  });
});
