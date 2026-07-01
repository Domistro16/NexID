import hre from "hardhat";
import { nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

const DEAD_GENESIS_LAUNCHER = "0x000000000000000000000000000000000000dEaD";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function configured(name: string, fallback?: string) {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredAddress(name: string, fallback?: string) {
  return ethers.getAddress(configured(name, fallback));
}

function optionalAddress(name: string, fallback?: string) {
  const value = process.env[name]?.trim() || fallback;
  return value ? ethers.getAddress(value) : undefined;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const contracts = nexMarketsContracts(8453);
  if (!contracts) throw new Error("Base NexMarkets contract config is missing.");

  const collateral = requiredAddress("USDC_BASE_MAINNET", contracts.collateral);
  const feeRouterAddress = requiredAddress("NATIVE_FEE_ROUTER_ADDRESS", contracts.feeRouter);
  const stakeVaultAddress = requiredAddress("NATIVE_LAUNCH_STAKE_VAULT_ADDRESS", contracts.launchStakeVault);
  const resolutionManagerAddress = requiredAddress("NATIVE_RESOLUTION_MANAGER_ADDRESS", contracts.resolutionManager);
  const launchAuthorizer = requiredAddress("NATIVE_LAUNCH_AUTHORIZER_ADDRESS");
  const genesisLauncher = optionalAddress("SPONSORED_FACTORY_GENESIS_LAUNCHER_ADDRESS", DEAD_GENESIS_LAUNCHER)
    ?? ethers.getAddress(DEAD_GENESIS_LAUNCHER);
  const genesisMaxMarkets = BigInt("1");
  const genesisDurationSeconds = BigInt("1");

  const MarketImplementation = await ethers.getContractFactory("NativeBinaryMarket");
  const marketImplementation = await MarketImplementation.deploy();
  await marketImplementation.waitForDeployment();
  const marketImplementationAddress = await marketImplementation.getAddress();

  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy(
    collateral,
    feeRouterAddress,
    stakeVaultAddress,
    resolutionManagerAddress,
    marketImplementationAddress,
    launchAuthorizer,
    genesisLauncher,
    genesisMaxMarkets,
    genesisDurationSeconds,
    deployer.address
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

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

  const feeRouter = await ethers.getContractAt("FeeRouter", feeRouterAddress);

  console.log(JSON.stringify({
    network: "base",
    deployer: deployer.address,
    sponsoredMarketImplementation: marketImplementationAddress,
    sponsoredMarketFactory: factoryAddress,
    existingMarketFactory: contracts.marketFactory,
    feeRouter: feeRouterAddress,
    feeRouterMarketFactory: await feeRouter.marketFactory(),
    feeRouterMarketFactoryUnchanged: (await feeRouter.marketFactory()).toLowerCase() === (contracts.marketFactory ?? "").toLowerCase(),
    collateral,
    launchStakeVault: stakeVaultAddress,
    resolutionManager: resolutionManagerAddress,
    launchAuthorizer,
    genesisLauncher,
    genesisDisabledByConfig: genesisLauncher.toLowerCase() === DEAD_GENESIS_LAUNCHER.toLowerCase(),
    configUpdateRequired: {
      file: "config/nexmarkets-contracts.ts",
      baseSponsoredMarketFactory: factoryAddress,
      legacyMarketFactories: [contracts.marketFactory].filter(Boolean)
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
