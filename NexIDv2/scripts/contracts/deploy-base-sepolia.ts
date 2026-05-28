import hre from "hardhat";

const { ethers } = hre;
const optimisticOracleV3Abi = ["function defaultCurrency() view returns (address)"] as const;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = required("PROTOCOL_TREASURY_ADDRESS");
  const rewardsPool = required("REWARDS_POOL_ADDRESS");
  const securityPool = required("SECURITY_POOL_ADDRESS");
  const collateralAddress = required("USDC_BASE_SEPOLIA");
  const launchAuthorizer = required("NATIVE_LAUNCH_AUTHORIZER_ADDRESS");
  const optimisticOracle = required("UMA_OPTIMISTIC_ORACLE_V3_ADDRESS");
  const oracle = await ethers.getContractAt(optimisticOracleV3Abi, optimisticOracle);
  const assertionCurrency = process.env.UMA_ASSERTION_CURRENCY_ADDRESS || (await oracle.defaultCurrency());
  const assertionLiveness = Number(process.env.UMA_ASSERTION_LIVENESS_SECONDS || 24 * 60 * 60);

  const feeRouter = await (await ethers.getContractFactory("FeeRouter")).deploy(deployer.address, treasury, rewardsPool, securityPool);
  const stakeVault = await (await ethers.getContractFactory("LaunchStakeVault")).deploy(collateralAddress, deployer.address, treasury, rewardsPool, securityPool);
  const resolutionManager = await (await ethers.getContractFactory("UmaResolutionManager")).deploy(
    deployer.address,
    await stakeVault.getAddress(),
    optimisticOracle,
    assertionCurrency,
    assertionLiveness
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
    feeRouter: await feeRouter.getAddress(),
    launchStakeVault: await stakeVault.getAddress(),
    resolutionMode: "uma_oov3",
    resolutionManager: await resolutionManager.getAddress(),
    optimisticOracle,
    assertionCurrency,
    assertionLiveness,
    marketFactory: await factory.getAddress()
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
