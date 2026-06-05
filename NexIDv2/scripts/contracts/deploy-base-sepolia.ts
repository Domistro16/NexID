import hre from "hardhat";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = required("PROTOCOL_TREASURY_ADDRESS");
  const securityPool = required("SECURITY_POOL_ADDRESS");
  const collateralAddress = required("USDC_BASE_SEPOLIA");
  const launchAuthorizer = required("NATIVE_LAUNCH_AUTHORIZER_ADDRESS");
  const rewardAuthorizer = required("EDGE_REWARD_AUTHORIZER_ADDRESS");
  const proofFlowChallengeWindow = Number(process.env.PROOFFLOW_CHALLENGE_WINDOW_SECONDS || 24 * 60 * 60);
  const rewardDistributor = process.env.EDGE_REWARD_DISTRIBUTOR_ADDRESS
    ? await ethers.getContractAt("EdgeRewardDistributor", process.env.EDGE_REWARD_DISTRIBUTOR_ADDRESS)
    : await (await ethers.getContractFactory("EdgeRewardDistributor")).deploy(collateralAddress, deployer.address, rewardAuthorizer);
  const rewardsPool = await rewardDistributor.getAddress();

  const feeRouter = await (await ethers.getContractFactory("FeeRouter")).deploy(deployer.address, treasury, rewardsPool, securityPool);
  const stakeVault = await (await ethers.getContractFactory("LaunchStakeVault")).deploy(collateralAddress, deployer.address, treasury, rewardsPool, securityPool);
  const resolutionManager = await (await ethers.getContractFactory("ResolutionManager")).deploy(
    deployer.address,
    await stakeVault.getAddress(),
    proofFlowChallengeWindow
  );
  const factory = await (await ethers.getContractFactory("MarketFactory")).deploy(
    collateralAddress,
    await feeRouter.getAddress(),
    await stakeVault.getAddress(),
    await resolutionManager.getAddress(),
    launchAuthorizer,
    deployer.address
  );

  await (await stakeVault.grantRole(await stakeVault.FACTORY_ROLE(), await factory.getAddress())).wait();
  await (await stakeVault.grantRole(await stakeVault.RESOLUTION_ROLE(), await resolutionManager.getAddress())).wait();

  const templates = ["token_price_threshold", "token_basket_race", "official_announcement", "sports_result", "chart_rank"];
  for (const template of templates) {
    await (await factory.setTemplateAllowed(ethers.id(template), true)).wait();
  }

  console.log(JSON.stringify({
    network: "baseSepolia",
    deployer: deployer.address,
    launchAuthorizer,
    collateral: collateralAddress,
    edgeRewardDistributor: rewardsPool,
    rewardAuthorizer,
    feeRouter: await feeRouter.getAddress(),
    launchStakeVault: await stakeVault.getAddress(),
    resolutionMode: "proofflow",
    resolutionManager: await resolutionManager.getAddress(),
    proofFlowChallengeWindow,
    marketFactory: await factory.getAddress()
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
