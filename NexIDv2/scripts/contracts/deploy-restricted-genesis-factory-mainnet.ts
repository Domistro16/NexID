import hre from "hardhat";
import { nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

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
  const genesisLauncher = requiredAddress("GENESIS_LAUNCHER_ADDRESS", contracts.genesisLauncher);
  const oldFactoryAddress = optionalAddress("NATIVE_MARKET_FACTORY_ADDRESS", contracts.marketFactory);
  const genesisMaxMarkets = BigInt(process.env.NATIVE_GENESIS_MAX_MARKETS ?? "200");
  const genesisDurationSeconds = BigInt(process.env.NATIVE_GENESIS_DURATION_SECONDS ?? String(90 * 24 * 60 * 60));

  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy(
    collateral,
    feeRouterAddress,
    stakeVaultAddress,
    resolutionManagerAddress,
    launchAuthorizer,
    genesisLauncher,
    genesisMaxMarkets,
    genesisDurationSeconds,
    deployer.address
  );
  await factory.waitForDeployment();
  const newFactoryAddress = await factory.getAddress();

  const stakeVault = await ethers.getContractAt("LaunchStakeVault", stakeVaultAddress);
  const feeRouter = await ethers.getContractAt("FeeRouter", feeRouterAddress);
  const factoryRole = await stakeVault.FACTORY_ROLE();
  let oldFactoryPaused: boolean | null = null;

  if (!(await stakeVault.hasRole(factoryRole, newFactoryAddress))) {
    await (await stakeVault.grantRole(factoryRole, newFactoryAddress)).wait();
  }

  if (
    oldFactoryAddress &&
    oldFactoryAddress.toLowerCase() !== newFactoryAddress.toLowerCase() &&
    await stakeVault.hasRole(factoryRole, oldFactoryAddress)
  ) {
    await (await stakeVault.revokeRole(factoryRole, oldFactoryAddress)).wait();
  }

  if (oldFactoryAddress && oldFactoryAddress.toLowerCase() !== newFactoryAddress.toLowerCase()) {
    const oldFactory = await ethers.getContractAt("MarketFactory", oldFactoryAddress);
    oldFactoryPaused = await oldFactory.paused();
    if (!oldFactoryPaused) {
      const pauserRole = await oldFactory.PAUSER_ROLE();
      if (await oldFactory.hasRole(pauserRole, deployer.address)) {
        await (await oldFactory.pause()).wait();
        oldFactoryPaused = true;
      }
    }
  }

  await (await feeRouter.setMarketFactory(newFactoryAddress)).wait();

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

  const genesisLauncherRole = await factory.GENESIS_LAUNCHER_ROLE();

  console.log(JSON.stringify({
    network: "base",
    deployer: deployer.address,
    replacedMarketFactory: oldFactoryAddress ?? null,
    marketFactory: newFactoryAddress,
    collateral,
    feeRouter: feeRouterAddress,
    launchStakeVault: stakeVaultAddress,
    resolutionManager: resolutionManagerAddress,
    launchAuthorizer,
    genesisLauncher,
    genesisLauncherHasRole: await factory.hasRole(genesisLauncherRole, genesisLauncher),
    feeRouterMarketFactory: await feeRouter.marketFactory(),
    newFactoryHasStakeVaultRole: await stakeVault.hasRole(factoryRole, newFactoryAddress),
    oldFactoryHasStakeVaultRole: oldFactoryAddress ? await stakeVault.hasRole(factoryRole, oldFactoryAddress) : null,
    oldFactoryPaused,
    genesisCap: (await factory.MAX_GENESIS_MARKETS()).toString(),
    genesisDuration: (await factory.GENESIS_DURATION()).toString(),
    genesisMarketCount: (await factory.genesisMarketCount()).toString()
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
