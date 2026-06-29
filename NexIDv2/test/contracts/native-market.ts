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
    const [
      admin,
      authorizer,
      genesisLauncher,
      creator,
      trader,
      traderTwo,
      treasury,
      rewards,
      security,
      prover1,
      prover2,
      prover3,
      prover4,
      prover5
    ] = await ethers.getSigners();

    const provers = [prover1.address, prover2.address, prover3.address, prover4.address, prover5.address];

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const collateral = await MockUSDC.deploy(admin.address);
    const targetToken = await MockUSDC.deploy(admin.address);

    const MockUniswapV2Router = await ethers.getContractFactory("MockUniswapV2Router");
    const mockRouter = await MockUniswapV2Router.deploy();

    const TokenBuybackBurner = await ethers.getContractFactory("TokenBuybackBurner");
    const buybackBurner = await TokenBuybackBurner.deploy(
      admin.address,
      await collateral.getAddress(),
      await targetToken.getAddress(),
      await mockRouter.getAddress()
    );

    const FeeRouter = await ethers.getContractFactory("FeeRouter");
    const feeRouter = await FeeRouter.deploy(admin.address, treasury.address, await buybackBurner.getAddress(), provers);

    const LaunchStakeVault = await ethers.getContractFactory("LaunchStakeVault");
    const stakeVault = await LaunchStakeVault.deploy(
      await collateral.getAddress(),
      admin.address,
      treasury.address,
      rewards.address,
      security.address
    );

    const ResolutionManager = await ethers.getContractFactory("ResolutionManager");
    const resolutionManager = await ResolutionManager.deploy(admin.address, await stakeVault.getAddress(), 24 * 60 * 60);

    const MarketFactory = await ethers.getContractFactory("MarketFactory");
    const marketFactory = await MarketFactory.deploy(
      await collateral.getAddress(),
      await feeRouter.getAddress(),
      await stakeVault.getAddress(),
      await resolutionManager.getAddress(),
      authorizer.address,
      genesisLauncher.address,
      100n,
      BigInt(90 * 24 * 60 * 60),
      admin.address
    );

    await stakeVault.grantRole(await stakeVault.FACTORY_ROLE(), await marketFactory.getAddress());
    await stakeVault.grantRole(await stakeVault.RESOLUTION_ROLE(), await resolutionManager.getAddress());
    await feeRouter.setMarketFactory(await marketFactory.getAddress());

    const templateId = ethers.id("token_price_threshold");
    await marketFactory.setTemplateAllowed(templateId, true);
    await collateral.mint(creator.address, ethers.parseUnits("100", 6));
    await collateral.mint(trader.address, ethers.parseUnits("100", 6));
    await collateral.mint(traderTwo.address, ethers.parseUnits("100", 6));

    return {
      admin,
      authorizer,
      genesisLauncher,
      creator,
      trader,
      traderTwo,
      treasury,
      rewards,
      security,
      prover1,
      prover2,
      prover3,
      prover4,
      prover5,
      provers,
      collateral,
      targetToken,
      mockRouter,
      buybackBurner,
      feeRouter,
      stakeVault,
      resolutionManager,
      marketFactory,
      templateId
    };
  }

  async function createMarketWithAuthorization(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    rulesHash: string,
    metadataHash: string,
    closeTime: number
  ) {
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

  async function createGenesisMarketWithAuthorization(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    rulesHash: string,
    metadataHash: string,
    closeTime: number
  ) {
    const authorization = await signLaunchAuthorization({
      marketFactory: fixture.marketFactory,
      authorizer: fixture.authorizer,
      creator: fixture.genesisLauncher.address,
      rulesHash,
      metadataHash,
      templateId: fixture.templateId,
      closeTime
    });
    return fixture.marketFactory.connect(fixture.genesisLauncher).createGenesisMarket(
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

    await expect(
      marketFactory.connect(trader).createMarket(rulesHash, metadataHash, templateId, closeTime, authorization)
    ).to.be.revertedWith("bad launch authorization");

    await collateral.connect(creator).approve(await marketFactory.getAddress(), ethers.parseUnits("40", 6));
    await expect(
      marketFactory.connect(creator).createMarket(rulesHash, metadataHash, templateId, closeTime, authorization)
    ).to.emit(marketFactory, "MarketCreated");

    const duplicateAuthorization = await signLaunchAuthorization({
      marketFactory,
      authorizer,
      creator: creator.address,
      rulesHash,
      metadataHash,
      templateId,
      closeTime
    });
    await expect(
      marketFactory.connect(creator).createMarket(rulesHash, metadataHash, templateId, closeTime, duplicateAuthorization)
    ).to.be.revertedWith("duplicate rules hash");
  });

  it("requires exactly five unique genesis provers", async function () {
    const fixture = await deployFixture();
    const { admin, treasury, buybackBurner, provers } = fixture;
    const FeeRouter = await ethers.getContractFactory("FeeRouter");

    await expect(
      FeeRouter.deploy(admin.address, treasury.address, await buybackBurner.getAddress(), provers.slice(0, 4))
    ).to.be.revertedWith("five provers required");

    await expect(
      FeeRouter.deploy(admin.address, treasury.address, await buybackBurner.getAddress(), [
        provers[0],
        provers[1],
        provers[2],
        provers[3],
        provers[3]
      ])
    ).to.be.revertedWith("duplicate prover");
  });

  it("splits launch stake and revised native trading fees for normal markets", async function () {
    const fixture = await deployFixture();
    const {
      creator,
      trader,
      treasury,
      rewards,
      security,
      prover1,
      prover2,
      prover3,
      prover4,
      prover5,
      collateral,
      marketFactory,
      mockRouter
    } = fixture;
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

    // Trade of 10 USDC (notional = 10, fee is 2% = 0.2 USDC)
    await market.connect(trader).buy(0, ethers.parseUnits("10", 6));

    // Normal-market fee distribution:
    // Creator: 1.00% = 0.1 USDC. Creator had 80.0 (after bond). Now has 80.1.
    // Platform (treasury): 0.35% = 0.035 USDC. Had 5.0. Now has 5.035.
    // Buyback/burn: 0.65% = 0.065 USDC, swapped by the burner.
    // Genesis provers do not receive normal-market fees.
    expect(await collateral.balanceOf(creator.address)).to.equal(ethers.parseUnits("80.1", 6));
    expect(await collateral.balanceOf(treasury.address)).to.equal(ethers.parseUnits("5.035", 6));
    expect(await collateral.balanceOf(await mockRouter.getAddress())).to.equal(ethers.parseUnits("0.065", 6));

    expect(await collateral.balanceOf(prover1.address)).to.equal(0);
    expect(await collateral.balanceOf(prover2.address)).to.equal(0);
    expect(await collateral.balanceOf(prover3.address)).to.equal(0);
    expect(await collateral.balanceOf(prover4.address)).to.equal(0);
    expect(await collateral.balanceOf(prover5.address)).to.equal(0);
  });

  it("automatically buys back and burns the target token when trading fees are routed (Uniswap V2)", async function () {
    const fixture = await deployFixture();
    const { creator, trader, collateral, marketFactory, mockRouter } = fixture;
    const rulesHash = ethers.id("buyback-burn-test-market");
    const metadataHash = ethers.id("metadata-buyback");
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;

    await collateral.connect(creator).approve(await marketFactory.getAddress(), ethers.parseUnits("20", 6));
    await createMarketWithAuthorization(fixture, rulesHash, metadataHash, closeTime);

    const marketAddress = await marketFactory.markets(0);
    const market = await ethers.getContractAt("NativeBinaryMarket", marketAddress);

    await time.increase(4 * 60);
    await collateral.connect(trader).approve(marketAddress, ethers.parseUnits("10.2", 6));

    // Trade of 10 USDC (notional = 10, fee is 2% = 0.2 USDC. Buyback fee is 0.65% = 0.065 USDC)
    // Buyback burner should receive 0.065 USDC and swap it on mockRouter
    await market.connect(trader).buy(0, ethers.parseUnits("10", 6));

    // Verify the mockRouter received the USDC
    expect(await collateral.balanceOf(await mockRouter.getAddress())).to.equal(ethers.parseUnits("0.065", 6));
  });

  it("automatically buys back and burns via Virtuals bonding curve before graduation", async function () {
    const fixture = await deployFixture();
    const { admin, creator, trader, collateral, targetToken, marketFactory, buybackBurner } = fixture;

    // Deploy MockVirtualsBonding
    const MockVirtualsBonding = await ethers.getContractFactory("MockVirtualsBonding");
    const mockBonding = await MockVirtualsBonding.deploy(await collateral.getAddress(), await targetToken.getAddress());

    // Grant MockVirtualsBonding minter role on targetToken so it can mint tokens to the burner
    const MINTER_ROLE = await targetToken.MINTER_ROLE();
    await targetToken.connect(admin).grantRole(MINTER_ROLE, await mockBonding.getAddress());

    // Configure buybackBurner for VirtualsBonding
    await buybackBurner.connect(admin).setVirtualToken(await collateral.getAddress());
    await buybackBurner.connect(admin).setBondingContract(await mockBonding.getAddress());
    await buybackBurner.connect(admin).setSwapType(3); // SwapType.VirtualsBonding

    const rulesHash = ethers.id("virtuals-bonding-burn-market");
    const metadataHash = ethers.id("metadata-virtuals-bonding");
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;

    await collateral.connect(creator).approve(await marketFactory.getAddress(), ethers.parseUnits("20", 6));
    await createMarketWithAuthorization(fixture, rulesHash, metadataHash, closeTime);

    const marketAddress = await marketFactory.markets(0);
    const market = await ethers.getContractAt("NativeBinaryMarket", marketAddress);

    await time.increase(4 * 60);
    await collateral.connect(trader).approve(marketAddress, ethers.parseUnits("10.2", 6));

    // Trade of 10 USDC (notional = 10, buyback fee is 0.065 USDC)
    // The buyback burner should receive 0.065 USDC, approve mockBonding, and call buy() on it.
    // The mockBonding will transfer the 0.065 USDC to itself and mint 0.13 targetToken back to the burner.
    // The burner will then burn those targetToken by transferring them to the dead address.
    await market.connect(trader).buy(0, ethers.parseUnits("10", 6));

    // Verify the mockBonding received the collateral (0.065 USDC)
    expect(await collateral.balanceOf(await mockBonding.getAddress())).to.equal(ethers.parseUnits("0.065", 6));

    // Verify the dead address received the burned targetToken (0.065 * 2 = 0.13 targetToken)
    expect(await targetToken.balanceOf("0x000000000000000000000000000000000000dEaD")).to.equal(ethers.parseUnits("0.13", 6));
  });

  it("handles Genesis Markets correctly (no bond, cap of 100, 90-day limit, correct fees)", async function () {
    const fixture = await deployFixture();
    const {
      genesisLauncher,
      trader,
      treasury,
      prover1,
      prover2,
      prover3,
      prover4,
      prover5,
      collateral,
      feeRouter,
      marketFactory,
      mockRouter
    } = fixture;

    const rulesHash = ethers.id("genesis-market-1");
    const metadataHash = ethers.id("metadata-genesis");
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;

    // The platform launcher does not need to approve collateral because Genesis Markets have no launch bond.
    const launcherBefore = await collateral.balanceOf(genesisLauncher.address);
    await createGenesisMarketWithAuthorization(fixture, rulesHash, metadataHash, closeTime);

    // Verify no bond was deducted.
    expect(await collateral.balanceOf(genesisLauncher.address)).to.equal(launcherBefore);

    const marketAddress = await marketFactory.markets(0);
    const market = await ethers.getContractAt("NativeBinaryMarket", marketAddress);

    expect(await marketFactory.isGenesisMarket(marketAddress)).to.be.true;
    expect(await marketFactory.genesisMarketCount()).to.equal(1);

    await time.increase(4 * 60);
    await collateral.connect(trader).approve(marketAddress, ethers.parseUnits("10.2", 6));

    // Trade of 10 USDC (notional = 10, fee is 2% = 0.2 USDC. Buyback fee is 1.65% = 0.165 USDC)
    await market.connect(trader).buy(0, ethers.parseUnits("10", 6));

    // Genesis market fee distribution:
    // Creator: 0% = 0 USDC. The platform launcher remains at launcherBefore.
    // Platform (treasury): 0.15% = 0.015 USDC. Had 0. Now has 0.015.
    // Provers Pool: 0.20% = 0.02 USDC, held until settlement release to the selected Prover panel.
    // Buyback/burn: 1.65% = 0.165 USDC, swapped by the burner.
    expect(await collateral.balanceOf(genesisLauncher.address)).to.equal(launcherBefore);
    expect(await collateral.balanceOf(treasury.address)).to.equal(ethers.parseUnits("0.015", 6));
    expect(await collateral.balanceOf(await mockRouter.getAddress())).to.equal(ethers.parseUnits("0.165", 6));

    expect(await collateral.balanceOf(await feeRouter.getAddress())).to.equal(ethers.parseUnits("0.02", 6));
    expect(await feeRouter.genesisProverPoolBalance(marketAddress)).to.equal(ethers.parseUnits("0.02", 6));
    expect(await feeRouter.genesisProverPoolAccrued(marketAddress)).to.equal(ethers.parseUnits("0.02", 6));
    expect(await feeRouter.genesisProverPoolReleased(marketAddress)).to.equal(0);
    expect(await feeRouter.claimableProverFees(marketAddress, prover1.address)).to.equal(0);
    expect(await feeRouter.claimableProverFees(marketAddress, prover2.address)).to.equal(0);
    expect(await feeRouter.claimableProverFees(marketAddress, prover3.address)).to.equal(0);
    expect(await feeRouter.claimableProverFees(marketAddress, prover4.address)).to.equal(0);
    expect(await feeRouter.claimableProverFees(marketAddress, prover5.address)).to.equal(0);

    await expect(
      feeRouter.connect(trader).claimProverFees(await collateral.getAddress(), [marketAddress])
    ).to.be.revertedWith("not genesis prover");
    await expect(
      feeRouter.connect(prover1).claimProverFees(await collateral.getAddress(), [marketAddress])
    ).to.be.revertedWith("nothing to claim");

    await expect(
      feeRouter.connect(trader).releaseGenesisProverPool(marketAddress)
    )
      .to.be.revertedWithCustomError(feeRouter, "AccessControlUnauthorizedAccount")
      .withArgs(trader.address, await feeRouter.PROVER_POOL_RELEASER_ROLE());

    await expect(feeRouter.setMarketProvers(marketAddress, [
      prover5.address,
      prover4.address,
      prover3.address,
      prover2.address,
      prover1.address
    ]))
      .to.emit(feeRouter, "MarketProversAssigned");
    expect(await feeRouter.getMarketProvers(marketAddress)).to.deep.equal([
      prover5.address,
      prover4.address,
      prover3.address,
      prover2.address,
      prover1.address
    ]);

    await expect(feeRouter.releaseGenesisProverPool(marketAddress))
      .to.emit(feeRouter, "GenesisProverPoolReleased")
      .withArgs(marketAddress, await collateral.getAddress(), ethers.parseUnits("0.02", 6));
    expect(await feeRouter.genesisProverPoolReleased(marketAddress)).to.equal(ethers.parseUnits("0.02", 6));
    expect(await feeRouter.genesisProverPoolBalance(marketAddress)).to.equal(0);
    expect(await collateral.balanceOf(await feeRouter.getAddress())).to.equal(0);
    expect(await collateral.balanceOf(prover1.address)).to.equal(ethers.parseUnits("0.004", 6));
    expect(await collateral.balanceOf(prover2.address)).to.equal(ethers.parseUnits("0.004", 6));
    expect(await collateral.balanceOf(prover3.address)).to.equal(ethers.parseUnits("0.004", 6));
    expect(await collateral.balanceOf(prover4.address)).to.equal(ethers.parseUnits("0.004", 6));
    expect(await collateral.balanceOf(prover5.address)).to.equal(ethers.parseUnits("0.004", 6));

    await expect(feeRouter.releaseGenesisProverPool(marketAddress)).to.be.revertedWith("nothing to release");

    for (const prover of [prover1, prover2, prover3, prover4, prover5]) {
      expect(await feeRouter.claimableProverFees(marketAddress, prover.address)).to.equal(0);
      await expect(
        feeRouter.connect(prover).claimProverFees(await collateral.getAddress(), [marketAddress])
      ).to.be.revertedWith("nothing to claim");
    }
  });

  it("enforces the Genesis Market cap", async function () {
    this.timeout(120_000);
    const fixture = await deployFixture();
    const { genesisLauncher, marketFactory } = fixture;
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;

    for (let i = 0; i < 100; i += 1) {
      await createGenesisMarketWithAuthorization(
        fixture,
        ethers.id(`genesis-cap-market-${i}`),
        ethers.id(`metadata-genesis-cap-${i}`),
        closeTime
      );
    }

    expect(await marketFactory.genesisMarketCount()).to.equal(100);

    await expect(
      createGenesisMarketWithAuthorization(
        fixture,
        ethers.id("genesis-cap-market-overflow"),
        ethers.id("metadata-genesis-cap-overflow"),
        closeTime
      )
    ).to.be.revertedWith("genesis cap reached");

    expect(await marketFactory.genesisMarketCount()).to.equal(100);
    expect(await marketFactory.marketsCount()).to.equal(100);
    expect(await fixture.collateral.balanceOf(genesisLauncher.address)).to.equal(0);
  });

  it("enforces the Genesis Market duration limit", async function () {
    const fixture = await deployFixture();
    const { authorizer, genesisLauncher, marketFactory, templateId } = fixture;

    await time.increase(90 * 24 * 60 * 60 + 1); // Fast forward 90 days and 1 second

    const rulesHash = ethers.id("late-genesis-market");
    const metadataHash = ethers.id("metadata-late-genesis");
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;

    const authorization = await signLaunchAuthorization({
      marketFactory,
      authorizer,
      creator: genesisLauncher.address,
      rulesHash,
      metadataHash,
      templateId,
      closeTime
    });

    await expect(
      marketFactory.connect(genesisLauncher).createGenesisMarket(
        rulesHash,
        metadataHash,
        templateId,
        closeTime,
        authorization
      )
    ).to.be.revertedWith("genesis period ended");
  });

  it("restricts Genesis Market launches to the Genesis launcher role", async function () {
    const fixture = await deployFixture();
    const { authorizer, creator, marketFactory, templateId } = fixture;
    const rulesHash = ethers.id("unauthorized-genesis-market");
    const metadataHash = ethers.id("metadata-unauthorized-genesis");
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

    await expect(
      marketFactory.connect(creator).createGenesisMarket(
        rulesHash,
        metadataHash,
        templateId,
        closeTime,
        authorization
      )
    )
      .to.be.revertedWithCustomError(marketFactory, "AccessControlUnauthorizedAccount")
      .withArgs(creator.address, await marketFactory.GENESIS_LAUNCHER_ROLE());
  });

  it("allows upgrading the FeeRouter on the factory and reflects on existing markets", async function () {
    const fixture = await deployFixture();
    const { admin, creator, trader, treasury, collateral, marketFactory, provers, buybackBurner } = fixture;
    const rulesHash = ethers.id("upgradable-fee-router-market");
    const metadataHash = ethers.id("metadata-upgradable");
    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;

    await collateral.connect(creator).approve(await marketFactory.getAddress(), ethers.parseUnits("20", 6));
    await createMarketWithAuthorization(fixture, rulesHash, metadataHash, closeTime);

    const marketAddress = await marketFactory.markets(0);
    const market = await ethers.getContractAt("NativeBinaryMarket", marketAddress);

    // Deploy a new FeeRouter with a different platform treasury
    const newTreasury = ethers.Wallet.createRandom().address;
    const FeeRouter = await ethers.getContractFactory("FeeRouter");
    const newFeeRouter = await FeeRouter.deploy(admin.address, newTreasury, await buybackBurner.getAddress(), provers);
    await newFeeRouter.setMarketFactory(await marketFactory.getAddress());

    // Upgrade the factory's feeRouter
    await marketFactory.connect(admin).setFeeRouter(await newFeeRouter.getAddress());

    // Trade on the already-deployed market
    await time.increase(4 * 60);
    await collateral.connect(trader).approve(marketAddress, ethers.parseUnits("10.2", 6));
    await market.connect(trader).buy(0, ethers.parseUnits("10", 6));

    // Verify the fee went to the new treasury, not the old treasury
    expect(await collateral.balanceOf(newTreasury)).to.equal(ethers.parseUnits("0.035", 6));
    expect(await collateral.balanceOf(treasury.address)).to.equal(ethers.parseUnits("5", 6)); // Only has the launch stake fee
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
