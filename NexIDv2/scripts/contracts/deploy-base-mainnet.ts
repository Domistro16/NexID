import hre from "hardhat";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalAddress(name: string) {
  const value = process.env[name]?.trim();
  return value ? ethers.getAddress(value) : undefined;
}

function optionalPrivateKeyAddress(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  return new ethers.Wallet(normalized).address;
}

function requiredAddress(name: string) {
  return ethers.getAddress(required(name));
}

function requiredAddressList(name: string, expectedLength: number) {
  const addresses = required(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ethers.getAddress(value));

  if (addresses.length !== expectedLength) {
    throw new Error(`${name} must contain exactly ${expectedLength} comma-separated addresses.`);
  }

  if (new Set(addresses.map((value) => value.toLowerCase())).size !== addresses.length) {
    throw new Error(`${name} contains duplicate addresses.`);
  }

  return addresses;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const usdc = requiredAddress("USDC_BASE_MAINNET");
  const treasury = requiredAddress("PROTOCOL_TREASURY_ADDRESS");
  const tokenBuybackBurner = requiredAddress("BUYBACK_BURN_SAFE_ADDRESS");
  const securityPool = requiredAddress("SECURITY_POOL_ADDRESS");
  const launchAuthorizer = requiredAddress("NATIVE_LAUNCH_AUTHORIZER_ADDRESS");
  const genesisLauncher = requiredAddress("GENESIS_LAUNCHER_ADDRESS");
  const genesisProvers = requiredAddressList("NATIVE_GENESIS_PROVER_ADDRESSES", 5);
  const launchFeePool = optionalAddress("REWARDS_POOL_ADDRESS") || treasury;
  const targetOrderExecutorBot = optionalAddress("NATIVE_TARGET_ORDER_EXECUTOR_BOT_ADDRESS") || deployer.address;
  const proverPoolReleaser =
    optionalAddress("NATIVE_PROVER_POOL_RELEASER_ADDRESS")
    || optionalPrivateKeyAddress("NATIVE_PROVER_POOL_RELEASER_PRIVATE_KEY")
    || optionalPrivateKeyAddress("NATIVE_RESOLUTION_BOT_PRIVATE_KEY")
    || deployer.address;
  const proofFlowChallengeWindow = Number(process.env.PROOFFLOW_CHALLENGE_WINDOW_SECONDS || 24 * 60 * 60);
  const genesisMaxMarkets = BigInt(process.env.NATIVE_GENESIS_MAX_MARKETS ?? "200");
  const genesisDurationSeconds = BigInt(process.env.NATIVE_GENESIS_DURATION_SECONDS ?? String(90 * 24 * 60 * 60));

  const feeRouter = await (await ethers.getContractFactory("FeeRouter")).deploy(
    deployer.address,
    treasury,
    tokenBuybackBurner,
    genesisProvers
  );
  const stakeVault = await (await ethers.getContractFactory("LaunchStakeVault")).deploy(
    usdc,
    deployer.address,
    treasury,
    launchFeePool,
    securityPool
  );
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
    genesisLauncher,
    genesisMaxMarkets,
    genesisDurationSeconds,
    deployer.address
  );
  const targetOrderExecutor = await (await ethers.getContractFactory("NativeTargetOrderExecutor")).deploy(
    usdc,
    deployer.address,
    targetOrderExecutorBot
  );

  await (await stakeVault.grantRole(await stakeVault.FACTORY_ROLE(), await factory.getAddress())).wait();
  await (await stakeVault.grantRole(await stakeVault.RESOLUTION_ROLE(), await resolutionManager.getAddress())).wait();
  await (await feeRouter.setMarketFactory(await factory.getAddress())).wait();
  if (proverPoolReleaser.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await feeRouter.grantRole(await feeRouter.PROVER_POOL_RELEASER_ROLE(), proverPoolReleaser)).wait();
  }

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
    genesisLauncher,
    collateral: usdc,
    feeRouter: await feeRouter.getAddress(),
    proverPoolReleaser,
    tokenBuybackBurner,
    tokenBuybackBurnerMode: "buyback_burn_safe_until_token_launch",
    genesisProvers,
    launchStakeVault: await stakeVault.getAddress(),
    launchFeePool,
    securityPool,
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
