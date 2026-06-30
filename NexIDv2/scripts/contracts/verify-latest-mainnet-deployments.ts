import hre from "hardhat";
import { nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredAddress(name: string) {
  return ethers.getAddress(required(name));
}

function optionalAddress(name: string) {
  const value = process.env[name]?.trim();
  return value ? ethers.getAddress(value) : undefined;
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

async function verifyContract(address: string, constructorArguments: unknown[]) {
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments
    });
    return { address, status: "submitted" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already verified/i.test(message)) {
      return { address, status: "already_verified" };
    }
    throw error;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const contracts = nexMarketsContracts(8453);
  if (
    !contracts?.feeRouter ||
    !contracts.marketFactory ||
    !contracts.marketImplementation ||
    !contracts.tokenBuybackBurner ||
    !contracts.launchStakeVault ||
    !contracts.resolutionManager ||
    !contracts.targetOrderExecutor
  ) {
    throw new Error("Base NexMarkets contract addresses must be configured.");
  }

  const collateral = requiredAddress("USDC_BASE_MAINNET");
  const platformTreasury = requiredAddress("PROTOCOL_TREASURY_ADDRESS");
  const launchFeePool = optionalAddress("REWARDS_POOL_ADDRESS") ?? platformTreasury;
  const securityPool = requiredAddress("SECURITY_POOL_ADDRESS");
  const launchAuthorizer = requiredAddress("NATIVE_LAUNCH_AUTHORIZER_ADDRESS");
  const genesisLauncher = contracts.genesisLauncher ?? requiredAddress("GENESIS_LAUNCHER_ADDRESS");
  const genesisProvers = requiredAddressList("NATIVE_GENESIS_PROVER_ADDRESSES", 5);
  const targetOrderExecutorBot = optionalAddress("NATIVE_TARGET_ORDER_EXECUTOR_BOT_ADDRESS") ?? deployer.address;
  const proofFlowChallengeWindow = BigInt(process.env.PROOFFLOW_CHALLENGE_WINDOW_SECONDS || 24 * 60 * 60);
  const genesisMaxMarkets = BigInt(process.env.NATIVE_GENESIS_MAX_MARKETS ?? "200");
  const genesisDurationSeconds = BigInt(process.env.NATIVE_GENESIS_DURATION_SECONDS ?? String(90 * 24 * 60 * 60));

  const results = [];
  results.push(await verifyContract(contracts.launchStakeVault, [
    collateral,
    deployer.address,
    platformTreasury,
    launchFeePool,
    securityPool
  ]));
  results.push(await verifyContract(contracts.resolutionManager, [
    deployer.address,
    contracts.launchStakeVault,
    proofFlowChallengeWindow
  ]));
  results.push(await verifyContract(contracts.targetOrderExecutor, [
    collateral,
    deployer.address,
    targetOrderExecutorBot
  ]));
  results.push(await verifyContract(contracts.feeRouter, [
    deployer.address,
    platformTreasury,
    contracts.tokenBuybackBurner,
    genesisProvers
  ]));
  results.push(await verifyContract(contracts.marketImplementation, []));
  results.push(await verifyContract(contracts.marketFactory, [
    collateral,
    contracts.feeRouter,
    contracts.launchStakeVault,
    contracts.resolutionManager,
    contracts.marketImplementation,
    launchAuthorizer,
    genesisLauncher,
    genesisMaxMarkets,
    genesisDurationSeconds,
    deployer.address
  ]));

  console.log(JSON.stringify({
    network: "base",
    deployer: deployer.address,
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
