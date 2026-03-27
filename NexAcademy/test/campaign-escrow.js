const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

function buildLeaf(address, amount) {
  const inner = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [address, amount]),
  );
  return ethers.keccak256(ethers.solidityPacked(["bytes32"], [inner]));
}

describe("CampaignEscrow", function () {
  async function deployFixture() {
    const [owner, sponsor, claimer] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const CampaignEscrow = await ethers.getContractFactory("CampaignEscrow");
    const escrow = await CampaignEscrow.deploy(owner.address, usdc.target, ethers.ZeroAddress);
    await escrow.waitForDeployment();

    return { escrow, usdc, owner, sponsor, claimer };
  }

  it("allows only finalized merkle-root claims after owner funding", async function () {
    const { escrow, usdc, owner, sponsor, claimer } = await deployFixture();
    const latestBlock = await ethers.provider.getBlock("latest");
    const endTimestamp = BigInt(latestBlock.timestamp + 24 * 60 * 60);
    const rewardAmount = 100_000_000n;

    await escrow.createCampaign(1, sponsor.address, endTimestamp);
    await usdc.mint(owner.address, rewardAmount);
    await usdc.approve(escrow.target, rewardAmount);
    await escrow.fundCampaign(0, rewardAmount);

    const root = buildLeaf(claimer.address, rewardAmount);
    await escrow.setClaimRoot(0, root);

    const network = await ethers.provider.getNetwork();
    const deadline = BigInt((await time.latest()) + 24 * 60 * 60);
    const signature = await claimer.signTypedData(
      {
        name: "CampaignEscrow",
        version: "1",
        chainId: Number(network.chainId),
        verifyingContract: escrow.target,
      },
      {
        ClaimReward: [
          { name: "escrowId", type: "uint256" },
          { name: "claimer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      {
        escrowId: 0n,
        claimer: claimer.address,
        amount: rewardAmount,
        deadline,
      },
    );
    const sig = ethers.Signature.from(signature);

    await time.increaseTo(Number(endTimestamp) + 1);

    await expect(
      escrow.claimRewardFor(0, claimer.address, rewardAmount, [], deadline, sig.v, sig.r, sig.s),
    )
      .to.emit(escrow, "RewardClaimed")
      .withArgs(0, claimer.address, rewardAmount);

    expect(await usdc.balanceOf(claimer.address)).to.equal(rewardAmount);
    expect(await escrow.hasClaimed(0, claimer.address)).to.equal(true);
  });

  it("restricts campaign funding to the contract owner", async function () {
    const { escrow, usdc, sponsor } = await deployFixture();
    const latestBlock = await ethers.provider.getBlock("latest");

    await escrow.createCampaign(
      1,
      sponsor.address,
      BigInt(latestBlock.timestamp + 24 * 60 * 60),
    );
    await usdc.mint(sponsor.address, 10_000_000n);
    await usdc.connect(sponsor).approve(escrow.target, 10_000_000n);

    await expect(
      escrow.connect(sponsor).fundCampaign(0, 10_000_000n),
    ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
  });
});
