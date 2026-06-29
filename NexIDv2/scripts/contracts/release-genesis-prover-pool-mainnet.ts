import hre from "hardhat";
import { nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function configuredFeeRouter() {
  const configured = nexMarketsContracts(8453)?.feeRouter ?? process.env.NATIVE_FEE_ROUTER_ADDRESS;
  if (!configured) throw new Error("FeeRouter address is required in config/nexmarkets-contracts.ts or NATIVE_FEE_ROUTER_ADDRESS.");
  return ethers.getAddress(configured);
}

function optionalAddressList(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const addresses = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ethers.getAddress(value));
  if (addresses.length !== 5) throw new Error(`${name} must contain exactly five comma-separated Prover addresses.`);
  if (new Set(addresses.map((value) => value.toLowerCase())).size !== addresses.length) {
    throw new Error(`${name} contains duplicate Prover addresses.`);
  }
  return addresses;
}

async function main() {
  const [signer] = await ethers.getSigners();
  const market = ethers.getAddress(required("MARKET_ADDRESS"));
  const feeRouterAddress = configuredFeeRouter();
  const feeRouter = await ethers.getContractAt("FeeRouter", feeRouterAddress);
  const releaserRole = await feeRouter.PROVER_POOL_RELEASER_ROLE();
  if (!(await feeRouter.hasRole(releaserRole, signer.address))) {
    throw new Error(`Signer ${signer.address} does not have PROVER_POOL_RELEASER_ROLE on ${feeRouterAddress}.`);
  }

  const marketProvers = optionalAddressList("MARKET_PROVER_ADDRESSES");
  let setMarketProversTxHash: string | null = null;
  if (marketProvers) {
    const tx = await feeRouter.setMarketProvers(market, marketProvers);
    setMarketProversTxHash = tx.hash;
    await tx.wait();
  }

  const accruedBefore = await feeRouter.genesisProverPoolAccrued(market);
  const releasedBefore = await feeRouter.genesisProverPoolReleased(market);
  const balanceBefore = await feeRouter.genesisProverPoolBalance(market);
  let txHash: string | null = null;
  if (accruedBefore > releasedBefore) {
    const tx = await feeRouter.releaseGenesisProverPool(market);
    txHash = tx.hash;
    await tx.wait();
  }

  console.log(JSON.stringify({
    network: "base",
    signer: signer.address,
    feeRouter: feeRouterAddress,
    market,
    accruedBefore: accruedBefore.toString(),
    releasedBefore: releasedBefore.toString(),
    balanceBefore: balanceBefore.toString(),
    accruedAfter: (await feeRouter.genesisProverPoolAccrued(market)).toString(),
    releasedAfter: (await feeRouter.genesisProverPoolReleased(market)).toString(),
    balanceAfter: (await feeRouter.genesisProverPoolBalance(market)).toString(),
    marketProvers: await feeRouter.getMarketProvers(market),
    setMarketProversTxHash,
    txHash
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
