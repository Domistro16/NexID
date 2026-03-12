import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('NexIDCampaigns - free public campaigns', function () {
  it('creates a campaign, enrolls a user, and completes it', async function () {
    const [owner, relayer, user] = await ethers.getSigners();

    const Contract = await ethers.getContractFactory('NexIDCampaigns');
    const contract = await Contract.deploy(owner.address);
    await contract.waitForDeployment();

    await (await contract.connect(owner).setRelayer(relayer.address)).wait();

    await (await contract.connect(owner).createCampaign(
      'Intro to Web3',
      'desc',
      'long desc',
      'instructor',
      [],
      [],
      'General',
      'BEGINNER',
      '',
      '1 hour',
      3
    )).wait();

    const campaign = await contract.getCampaign(0);
    expect(campaign.title).to.equal('Intro to Web3');
    expect(campaign.isActive).to.equal(true);

    // Enroll user
    await (await contract.connect(user).enroll(0, user.address)).wait();
    expect(await contract.isUserEnrolled(user.address, 0)).to.equal(true);

    // Complete campaign
    await (await contract.connect(relayer).completeCampaign(0, user.address)).wait();
    expect(await contract.hasUserCompleted(user.address, 0)).to.equal(true);
    expect(await contract.isUserEnrolled(user.address, 0)).to.equal(false);
  });
});

describe('PartnerCampaigns - partner campaigns with points', function () {
  it('creates campaign, enrolls users, awards points, and reads leaderboard', async function () {
    const [owner, relayer, user1, user2, sponsor] = await ethers.getSigners();

    const Contract = await ethers.getContractFactory('PartnerCampaigns');
    const contract = await Contract.deploy(owner.address);
    await contract.waitForDeployment();

    await (await contract.connect(owner).setRelayer(relayer.address)).wait();

    const now = (await ethers.provider.getBlock('latest'))!.timestamp;

    await (await contract.connect(owner).createCampaign(
      'DeFi Challenge',
      'A partner campaign',
      'DeFi',
      'INTERMEDIATE',
      '',
      '2 weeks',
      5,
      sponsor.address,
      'PartnerDAO',
      '',
      ethers.parseUnits('10000', 6), // 10k USDC prize pool (informational)
      now,
      now + 86400 * 30 // 30 days
    )).wait();

    const campaign = await contract.getCampaign(0);
    expect(campaign.title).to.equal('DeFi Challenge');
    expect(campaign.sponsor).to.equal(sponsor.address);
    expect(campaign.isActive).to.equal(true);

    // Enroll users
    await (await contract.connect(user1).enroll(0, user1.address)).wait();
    await (await contract.connect(user2).enroll(0, user2.address)).wait();

    // Award points
    await (await contract.connect(relayer).addPoints(0, user1.address, 150)).wait();
    await (await contract.connect(relayer).addPoints(0, user2.address, 200)).wait();
    await (await contract.connect(relayer).addPoints(0, user1.address, 100)).wait();

    expect(await contract.getUserCampaignPoints(0, user1.address)).to.equal(250n);
    expect(await contract.getUserCampaignPoints(0, user2.address)).to.equal(200n);

    // Read leaderboard
    const [users, points] = await contract.getLeaderboard(0);
    expect(users.length).to.equal(2);
    expect(points.length).to.equal(2);
  });

  it('supports batch point updates', async function () {
    const [owner, relayer, user1, user2] = await ethers.getSigners();

    const Contract = await ethers.getContractFactory('PartnerCampaigns');
    const contract = await Contract.deploy(owner.address);
    await contract.waitForDeployment();

    await (await contract.connect(owner).setRelayer(relayer.address)).wait();

    const now = (await ethers.provider.getBlock('latest'))!.timestamp;

    await (await contract.connect(owner).createCampaign(
      'Batch Test',
      'desc',
      'Cat',
      'BEGINNER',
      '',
      '1 week',
      3,
      owner.address,
      'TestSponsor',
      '',
      0,
      now,
      now + 86400
    )).wait();

    await (await contract.connect(user1).enroll(0, user1.address)).wait();
    await (await contract.connect(user2).enroll(0, user2.address)).wait();

    // Batch add points
    await (await contract.connect(relayer).batchAddPoints(
      0,
      [user1.address, user2.address],
      [50, 75]
    )).wait();

    expect(await contract.getUserCampaignPoints(0, user1.address)).to.equal(50n);
    expect(await contract.getUserCampaignPoints(0, user2.address)).to.equal(75n);
  });
});

describe('CampaignEscrow - USDC prize pool distribution', function () {
  it('creates escrow, funds it, closes, and distributes rewards', async function () {
    const [owner, sponsor, user1, user2] = await ethers.getSigners();

    // Deploy a mock ERC20 for USDC
    const MockERC20 = await ethers.getContractFactory(
      'contracts/test/MockUSDC.sol:MockUSDC'
    );
    const mockUsdc = await MockERC20.deploy();
    await mockUsdc.waitForDeployment();
    const usdcAddr = await mockUsdc.getAddress();

    // Deploy escrow (no PartnerCampaigns link for this test)
    const Escrow = await ethers.getContractFactory('CampaignEscrow');
    const escrow = await Escrow.deploy(owner.address, usdcAddr, ethers.ZeroAddress);
    await escrow.waitForDeployment();

    // Create campaign with end time in the past (for testing close)
    const now = (await ethers.provider.getBlock('latest'))!.timestamp;
    await (await escrow.connect(owner).createCampaign(
      0, // partnerCampaignId
      sponsor.address,
      now + 2 // end in 2 seconds
    )).wait();

    // Mint USDC to sponsor and approve escrow
    await (await mockUsdc.mint(sponsor.address, ethers.parseUnits('5000', 6))).wait();
    await (await mockUsdc.connect(sponsor).approve(
      await escrow.getAddress(),
      ethers.parseUnits('5000', 6)
    )).wait();

    // Fund campaign
    await (await escrow.connect(sponsor).fundCampaign(
      0,
      ethers.parseUnits('5000', 6)
    )).wait();

    const campaign = await escrow.getCampaign(0);
    expect(campaign.totalFunded).to.equal(ethers.parseUnits('5000', 6));

    // Advance time past end
    await ethers.provider.send('evm_increaseTime', [10]);
    await ethers.provider.send('evm_mine', []);

    // Close campaign
    await (await escrow.connect(owner).closeCampaign(0)).wait();

    // Sponsor distributes rewards
    await (await escrow.connect(sponsor).distribute(
      0,
      [user1.address, user2.address],
      [ethers.parseUnits('3000', 6), ethers.parseUnits('1500', 6)]
    )).wait();

    expect(await mockUsdc.balanceOf(user1.address)).to.equal(
      ethers.parseUnits('3000', 6)
    );
    expect(await mockUsdc.balanceOf(user2.address)).to.equal(
      ethers.parseUnits('1500', 6)
    );

    // Withdraw remaining
    await (await escrow.connect(sponsor).withdrawRemaining(0)).wait();
    expect(await mockUsdc.balanceOf(sponsor.address)).to.equal(
      ethers.parseUnits('500', 6)
    );
  });
});
