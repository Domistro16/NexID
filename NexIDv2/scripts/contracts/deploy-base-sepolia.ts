import hre from "hardhat";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function launchAuthorizerAddress(fallback: string) {
  const configuredAddress = process.env.NATIVE_LAUNCH_AUTHORIZER_ADDRESS;
  if (configuredAddress) return configuredAddress;

  const privateKey = process.env.NATIVE_LAUNCH_AUTHORIZER_PRIVATE_KEY;
  if (privateKey) return new ethers.Wallet(privateKey).address;

  return fallback;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = required("PROTOCOL_TREASURY_ADDRESS");
  const rewardsPool = required("REWARDS_POOL_ADDRESS");
  const securityPool = required("SECURITY_POOL_ADDRESS");
  const usdcAddress = process.env.USDC_BASE_SEPOLIA;
  const launchAuthorizer = launchAuthorizerAddress(deployer.address);

  const collateral = usdcAddress
    ? await ethers.getContractAt("IERC20", usdcAddress)
    : await (await ethers.getContractFactory("MockUSDC")).deploy(deployer.address);

  const collateralAddress = await collateral.getAddress();

  const feeRouter = await (await ethers.getContractFactory("FeeRouter")).deploy(deployer.address, treasury, rewardsPool, securityPool);
  const stakeVault = await (await ethers.getContractFactory("LaunchStakeVault")).deploy(collateralAddress, deployer.address, treasury, rewardsPool, securityPool);
  const resolutionManager = await (await ethers.getContractFactory("ResolutionManager")).deploy(deployer.address, await stakeVault.getAddress(), 24 * 60 * 60);
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
    feeRouter: await feeRouter.getAddress(),
    launchStakeVault: await stakeVault.getAddress(),
    resolutionManager: await resolutionManager.getAddress(),
    marketFactory: await factory.getAddress()
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
