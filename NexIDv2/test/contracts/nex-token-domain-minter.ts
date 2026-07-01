import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

describe("NexTokenDomainMinter", function () {
  async function deployFixture() {
    const [admin, buyer, referrer, burn, resolver, other] = await ethers.getSigners();
    const price = ethers.parseUnits("100", 6);

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const token = await MockUSDC.deploy(admin.address);

    const MockAgentRegistrarController = await ethers.getContractFactory("MockAgentRegistrarController");
    const controller = await MockAgentRegistrarController.deploy(admin.address);

    const MockReferralVerifier = await ethers.getContractFactory("MockReferralVerifier");
    const referralVerifier = await MockReferralVerifier.deploy();

    const MockReverseRegistrar = await ethers.getContractFactory("MockReverseRegistrar");
    const reverseRegistrar = await MockReverseRegistrar.deploy(admin.address);

    const NexTokenDomainMinter = await ethers.getContractFactory("NexTokenDomainMinter");
    const minter = await NexTokenDomainMinter.deploy(
      admin.address,
      await token.getAddress(),
      await controller.getAddress(),
      await referralVerifier.getAddress(),
      await reverseRegistrar.getAddress(),
      resolver.address,
      burn.address,
      price
    );

    await controller.connect(admin).transferOwnership(await minter.getAddress());
    await reverseRegistrar.connect(admin).setController(await minter.getAddress(), true);
    await token.mint(buyer.address, ethers.parseUnits("1000", 6));
    await token.connect(buyer).approve(await minter.getAddress(), ethers.parseUnits("1000", 6));

    return {
      admin,
      buyer,
      referrer,
      burn,
      resolver,
      other,
      price,
      token,
      controller,
      referralVerifier,
      reverseRegistrar,
      minter
    };
  }

  function label(name: string) {
    return ethers.keccak256(ethers.toUtf8Bytes(name));
  }

  async function referralData(fixture: Awaited<ReturnType<typeof deployFixture>>, name: string) {
    return {
      referrer: fixture.referrer.address,
      registrant: fixture.buyer.address,
      nameHash: label(name),
      referrerCodeHash: label("referrer"),
      deadline: BigInt(await time.latest()) + 3600n,
      nonce: ethers.hexlify(ethers.randomBytes(32))
    };
  }

  const emptyReferral = {
    referrer: ethers.ZeroAddress,
    registrant: ethers.ZeroAddress,
    nameHash: ethers.ZeroHash,
    referrerCodeHash: ethers.ZeroHash,
    deadline: 0n,
    nonce: ethers.ZeroHash
  };

  function mintRequest(fixture: Awaited<ReturnType<typeof deployFixture>>, name: string, reverseRecord = false) {
    return {
      name,
      owner: fixture.buyer.address,
      resolverData: [],
      reverseRecord,
      ownerControlledFuses: 0,
      deployWallet: false,
      walletSalt: 0
    };
  }

  it("mints through the reserved owner path and burns the full token payment without referral", async function () {
    const fixture = await deployFixture();

    await expect(
      fixture.minter.connect(fixture.buyer).mintWithToken(
        mintRequest(fixture, "agentalpha"),
        emptyReferral,
        "0x"
      )
    )
      .to.emit(fixture.minter, "TokenDomainMinted")
      .withArgs("agentalpha", fixture.buyer.address, fixture.buyer.address, fixture.price, 0, fixture.price, false);

    expect(await fixture.controller.mintedOwners(label("agentalpha"))).to.equal(fixture.buyer.address);
    expect(await fixture.controller.reservedOwners(label("agentalpha"))).to.equal(ethers.ZeroAddress);
    expect(await fixture.token.balanceOf(fixture.burn.address)).to.equal(fixture.price);
  });

  it("pays token referral rewards and burns the remainder", async function () {
    const fixture = await deployFixture();
    const data = await referralData(fixture, "agentbeta");
    const expectedReferral = fixture.price * 25n / 100n;
    const expectedBurn = fixture.price - expectedReferral;

    await fixture.minter.connect(fixture.buyer).mintWithToken(
      mintRequest(fixture, "agentbeta"),
      data,
      "0x1234"
    );

    expect(await fixture.controller.mintedOwners(label("agentbeta"))).to.equal(fixture.buyer.address);
    expect(await fixture.token.balanceOf(fixture.referrer.address)).to.equal(expectedReferral);
    expect(await fixture.token.balanceOf(fixture.burn.address)).to.equal(expectedBurn);
    expect(await fixture.token.balanceOf(await fixture.minter.getAddress())).to.equal(0);
  });

  it("sets reverse records through the reverse registrar controller role", async function () {
    const fixture = await deployFixture();

    await fixture.minter.connect(fixture.buyer).mintWithToken(
      mintRequest(fixture, "agentgamma", true),
      emptyReferral,
      "0x"
    );

    expect(await fixture.reverseRegistrar.names(fixture.buyer.address)).to.equal("agentgamma.id");
  });

  it("rejects mismatched referral payloads", async function () {
    const fixture = await deployFixture();
    const data = await referralData(fixture, "wrongname");

    await expect(
      fixture.minter.connect(fixture.buyer).mintWithToken(
        mintRequest(fixture, "agentdelta"),
        data,
        "0x1234"
      )
    ).to.be.revertedWith("referral name mismatch");
  });

  it("lets the minter owner reclaim AgentRegistrarController ownership", async function () {
    const fixture = await deployFixture();
    expect(await fixture.controller.owner()).to.equal(await fixture.minter.getAddress());

    await fixture.minter.connect(fixture.admin).transferAgentRegistrarOwnership(fixture.admin.address);

    expect(await fixture.controller.owner()).to.equal(fixture.admin.address);
  });

  it("requires the minter to own the agent registrar before minting", async function () {
    const fixture = await deployFixture();
    await fixture.minter.connect(fixture.admin).transferAgentRegistrarOwnership(fixture.admin.address);

    await expect(
      fixture.minter.connect(fixture.buyer).mintWithToken(
        mintRequest(fixture, "agentepsilon"),
        emptyReferral,
        "0x"
      )
    ).to.be.revertedWith("minter is not controller owner");
  });
});
