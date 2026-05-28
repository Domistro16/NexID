import hre from "hardhat";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  if (process.env.NATIVE_MARKETS_CANARY_MODE !== "true") {
    throw new Error("Set NATIVE_MARKETS_CANARY_MODE=true before deploying native contracts to Base mainnet.");
  }

  const [deployer] = await ethers.getSigners();
  const usdc = required("USDC_BASE_MAINNET");
  const treasury = required("PROTOCOL_TREASURY_ADDRESS");
  const rewardsPool = required("REWARDS_POOL_ADDRESS");
  const securityPool = required("SECURITY_POOL_ADDRESS");
  const launchAuthorizer = required("NATIVE_LAUNCH_AUTHORIZER_ADDRESS");

  const feeRouter = await (await ethers.getContractFactory("FeeRouter")).deploy(deployer.address, treasury, rewardsPool, securityPool);
  const stakeVault = await (await ethers.getContractFactory("LaunchStakeVault")).deploy(usdc, deployer.address, treasury, rewardsPool, securityPool);
  const resolutionManager = await (await ethers.getContractFactory("ResolutionManager")).deploy(deployer.address, await stakeVault.getAddress(), 24 * 60 * 60);
  const factory = await (await ethers.getContractFactory("MarketFactory")).deploy(
    usdc,
    await feeRouter.getAddress(),
    await stakeVault.getAddress(),
    await resolutionManager.getAddress(),
    launchAuthorizer,
    deployer.address
  );

  await (await stakeVault.grantRole(await stakeVault.FACTORY_ROLE(), await factory.getAddress())).wait();
  await (await stakeVault.grantRole(await stakeVault.RESOLUTION_ROLE(), await resolutionManager.getAddress())).wait();

  console.log(JSON.stringify({
    network: "base",
    canaryMode: true,
    deployer: deployer.address,
    launchAuthorizer,
    collateral: usdc,
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
