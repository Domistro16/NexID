import hre from "hardhat";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function resolveRewardDistributor(rewardToken: string, admin: string, rewardAuthorizer: string) {
  const configuredAddress = process.env.EDGE_REWARD_DISTRIBUTOR_ADDRESS;
  if (configuredAddress) {
    const distributor = await ethers.getContractAt("EdgeRewardDistributor", configuredAddress);
    const configuredRewardToken = await distributor.rewardToken().catch(() => {
      throw new Error(`EDGE_REWARD_DISTRIBUTOR_ADDRESS ${configuredAddress} is not an EdgeRewardDistributor on this network.`);
    });
    if (ethers.getAddress(configuredRewardToken) !== ethers.getAddress(rewardToken)) {
      throw new Error(`EDGE_REWARD_DISTRIBUTOR_ADDRESS ${configuredAddress} uses reward token ${configuredRewardToken}, expected ${rewardToken}.`);
    }
    return distributor;
  }

  const distributor = await (await ethers.getContractFactory("EdgeRewardDistributor")).deploy(
    rewardToken,
    admin,
    rewardAuthorizer
  );
  await distributor.waitForDeployment();
  return distributor;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const usdc = required("USDC_BASE_MAINNET");
  const treasury = required("PROTOCOL_TREASURY_ADDRESS");
  const securityPool = required("SECURITY_POOL_ADDRESS");
  const launchAuthorizer = required("NATIVE_LAUNCH_AUTHORIZER_ADDRESS");
  const rewardAuthorizer = required("EDGE_REWARD_AUTHORIZER_ADDRESS");
  const targetOrderExecutorBot = process.env.NATIVE_TARGET_ORDER_EXECUTOR_BOT_ADDRESS || deployer.address;
  const proofFlowChallengeWindow = Number(process.env.PROOFFLOW_CHALLENGE_WINDOW_SECONDS || 24 * 60 * 60);
  const rewardDistributor = await resolveRewardDistributor(usdc, deployer.address, rewardAuthorizer);
  const rewardsPool = await rewardDistributor.getAddress();

  const feeRouter = await (await ethers.getContractFactory("FeeRouter")).deploy(deployer.address, treasury, rewardsPool, securityPool);
  const stakeVault = await (await ethers.getContractFactory("LaunchStakeVault")).deploy(usdc, deployer.address, treasury, rewardsPool, securityPool);
  const resolutionManager = await (await ethers.getContractFactory("ResolutionManager")).deploy(
    deployer.address,
    await stakeVault.getAddress(),
    proofFlowChallengeWindow
  );
  const factory = await (await ethers.getContractFactory("MarketFactory")).deploy(
    usdc,
    await feeRouter.getAddress(),
    await stakeVault.getAddress(),
    await resolutionManager.getAddress(),
    launchAuthorizer,
    deployer.address
  );
  const targetOrderExecutor = await (await ethers.getContractFactory("NativeTargetOrderExecutor")).deploy(
    usdc,
    deployer.address,
    targetOrderExecutorBot
  );

  await (await stakeVault.grantRole(await stakeVault.FACTORY_ROLE(), await factory.getAddress())).wait();
  await (await stakeVault.grantRole(await stakeVault.RESOLUTION_ROLE(), await resolutionManager.getAddress())).wait();

  const templates = [
    "token_price_threshold",
    "token_basket_race",
    "official_announcement",
    "sports_result",
    "sports_transfer",
    "chart_rank",
    "award_outcome",
    "public_release",
    "custom_objective"
  ];
  for (const template of templates) {
    await (await factory.setTemplateAllowed(ethers.id(template), true)).wait();
  }

  console.log(JSON.stringify({
    network: "base",
    deployer: deployer.address,
    launchAuthorizer,
    edgeRewardDistributor: rewardsPool,
    rewardAuthorizer,
    collateral: usdc,
    feeRouter: await feeRouter.getAddress(),
    launchStakeVault: await stakeVault.getAddress(),
    resolutionMode: "proofflow",
    resolutionManager: await resolutionManager.getAddress(),
    proofFlowChallengeWindow,
    marketFactory: await factory.getAddress(),
    targetOrderExecutor: await targetOrderExecutor.getAddress(),
    targetOrderExecutorBot
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
