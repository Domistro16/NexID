const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PartnerCampaigns", function () {
  async function deployFixture() {
    const [owner, relayer, sponsor, user] = await ethers.getSigners();
    const PartnerCampaigns = await ethers.getContractFactory("PartnerCampaigns");
    const contract = await PartnerCampaigns.deploy(owner.address);
    await contract.waitForDeployment();
    return { contract, owner, relayer, sponsor, user };
  }

  it("derives launch sprint timing and winner cap from the plan", async function () {
    const { contract, relayer, sponsor, user } = await deployFixture();
    const latestBlock = await ethers.provider.getBlock("latest");
    const startTime = BigInt(latestBlock.timestamp + 5);

    await contract.createCampaign(
      "Launch Sprint",
      "Focused growth sprint",
      "LAUNCH_SPRINT",
      "Beginner",
      "",
      3,
      sponsor.address,
      "Protocol",
      "",
      5_000_000_000n,
      startTime,
      0,
      0,
    );

    await contract.setRelayer(relayer.address);

    const campaign = await contract.getCampaign(0);
    expect(campaign.plan).to.equal(0n);
    expect(campaign.durationDays).to.equal(7n);
    expect(campaign.winnerCap).to.equal(150n);
    expect(campaign.payoutRounds).to.equal(1n);
    expect(campaign.payoutIntervalDays).to.equal(7n);
    expect(campaign.endTime).to.equal(startTime + 7n * 24n * 60n * 60n);

    await time.increaseTo(Number(startTime));
    await contract.enroll(0, user.address);
    await contract.connect(relayer).addPoints(0, user.address, 25);

    await time.increase(8 * 24 * 60 * 60);
    expect(await contract.isCampaignLive(0)).to.equal(false);
    await expect(
      contract.connect(relayer).addPoints(0, user.address, 10),
    ).to.be.revertedWithCustomError(contract, "CampaignEnded");
  });

  it("requires a custom winner cap of at least ten", async function () {
    const { contract, sponsor } = await deployFixture();

    await expect(
      contract.createCampaign(
        "Academy Retainer",
        "Rolling academy",
        "CUSTOM",
        "Advanced",
        "",
        5,
        sponsor.address,
        "Protocol",
        "",
        30_000_000_000n,
        0,
        2,
        9,
      ),
    ).to.be.revertedWithCustomError(contract, "InvalidWinnerCap");
  });
});
