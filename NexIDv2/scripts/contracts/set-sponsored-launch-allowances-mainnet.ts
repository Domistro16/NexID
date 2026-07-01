import hre from "hardhat";
import { nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalAddress(name: string, fallback?: string) {
  const value = process.env[name]?.trim() || fallback;
  return value ? ethers.getAddress(value) : undefined;
}

function requiredAddressList(name: string) {
  const addresses = required(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ethers.getAddress(value));

  if (!addresses.length) {
    throw new Error(`${name} must contain at least one address.`);
  }

  if (new Set(addresses.map((value) => value.toLowerCase())).size !== addresses.length) {
    throw new Error(`${name} contains duplicate addresses.`);
  }

  return addresses;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const contracts = nexMarketsContracts(8453);
  const configuredFactory = contracts?.sponsoredMarketFactory ?? contracts?.marketFactory;
  if (!configuredFactory) throw new Error("Base sponsoredMarketFactory or marketFactory is missing from config/nexmarkets-contracts.ts.");

  const factoryAddress = optionalAddress("NATIVE_SPONSORED_MARKET_FACTORY_ADDRESS", configuredFactory);
  if (!factoryAddress) throw new Error("NATIVE_MARKET_FACTORY_ADDRESS is required.");

  const sponsoredLaunchers = requiredAddressList("SPONSORED_LAUNCHER_ADDRESSES");
  const allowance = BigInt(process.env.SPONSORED_LAUNCH_ALLOWANCE ?? "20");
  if (allowance <= 0n) throw new Error("SPONSORED_LAUNCH_ALLOWANCE must be greater than zero.");

  const factory = await ethers.getContractAt("MarketFactory", factoryAddress);
  const allowances = sponsoredLaunchers.map(() => allowance);
  await (await factory.setSponsoredLaunchAllowances(sponsoredLaunchers, allowances)).wait();

  const results = [];
  for (const launcher of sponsoredLaunchers) {
    results.push({
      launcher,
      allowance: (await factory.sponsoredLaunchAllowance(launcher)).toString(),
      used: (await factory.sponsoredLaunchUsed(launcher)).toString()
    });
  }

  console.log(JSON.stringify({
    network: "base",
    deployer: deployer.address,
    marketFactory: factoryAddress,
    sponsoredLaunchAllowance: allowance.toString(),
    sponsoredLaunchers: results
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
