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

function optionalPrivateKeyAddress(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  return new ethers.Wallet(normalized).address;
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
  const currentConfig = nexMarketsContracts(8453);
  const factoryAddress = requiredAddress("NATIVE_MARKET_FACTORY_ADDRESS");
  const platformTreasury = requiredAddress("PROTOCOL_TREASURY_ADDRESS");
  const buybackBurnAddress = ethers.getAddress(currentConfig?.tokenBuybackBurner ?? required("BUYBACK_BURN_SAFE_ADDRESS"));
  const genesisProvers = requiredAddressList("NATIVE_GENESIS_PROVER_ADDRESSES", 5);
  const oldFeeRouterAddress = optionalAddress("NATIVE_FEE_ROUTER_ADDRESS") ?? (currentConfig?.feeRouter ? ethers.getAddress(currentConfig.feeRouter) : undefined);
  const proverPoolReleaser =
    optionalAddress("NATIVE_PROVER_POOL_RELEASER_ADDRESS")
    ?? optionalPrivateKeyAddress("NATIVE_PROVER_POOL_RELEASER_PRIVATE_KEY")
    ?? optionalPrivateKeyAddress("NATIVE_RESOLUTION_BOT_PRIVATE_KEY")
    ?? deployer.address;

  const FeeRouter = await ethers.getContractFactory("FeeRouter");
  const feeRouter = await FeeRouter.deploy(deployer.address, platformTreasury, buybackBurnAddress, genesisProvers);
  await feeRouter.waitForDeployment();
  const newFeeRouterAddress = await feeRouter.getAddress();

  await (await feeRouter.setMarketFactory(factoryAddress)).wait();

  const releaserRole = await feeRouter.PROVER_POOL_RELEASER_ROLE();
  if (!(await feeRouter.hasRole(releaserRole, proverPoolReleaser))) {
    await (await feeRouter.grantRole(releaserRole, proverPoolReleaser)).wait();
  }

  const factory = await ethers.getContractAt("MarketFactory", factoryAddress);
  await (await factory.setFeeRouter(newFeeRouterAddress)).wait();

  console.log(JSON.stringify({
    network: "base",
    deployer: deployer.address,
    replacedFeeRouter: oldFeeRouterAddress ?? null,
    feeRouter: newFeeRouterAddress,
    marketFactory: factoryAddress,
    factoryFeeRouter: await factory.feeRouter(),
    platformTreasury,
    buybackBurnAddress,
    genesisProvers,
    proverPoolReleaser,
    releaserHasRole: await feeRouter.hasRole(releaserRole, proverPoolReleaser),
    oldFeeRouterStillConfiguredOnFactory: oldFeeRouterAddress
      ? (await factory.feeRouter()).toLowerCase() === oldFeeRouterAddress.toLowerCase()
      : null
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
