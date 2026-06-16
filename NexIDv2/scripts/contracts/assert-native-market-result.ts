import hre from "hardhat";
import { nexMarketsChainIdForNetwork, nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function resultConfig(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ride") return { side: 0, invalid: false };
  if (normalized === "fade") return { side: 1, invalid: false };
  if (normalized === "invalid" || normalized === "invalid_ride") return { side: 0, invalid: true };
  if (normalized === "invalid_fade") return { side: 1, invalid: true };
  throw new Error("NATIVE_MARKET_RESULT must be ride, fade, invalid, invalid_ride, or invalid_fade");
}

async function main() {
  const managerAddress = nexMarketsContracts(nexMarketsChainIdForNetwork(hre.network.name))?.resolutionManager ?? required("NATIVE_RESOLUTION_MANAGER_ADDRESS");
  const marketAddress = required("NATIVE_MARKET_CONTRACT_ADDRESS");
  const claim = required("NATIVE_MARKET_ASSERTION_CLAIM");
  const result = resultConfig(required("NATIVE_MARKET_RESULT"));

  const manager = await ethers.getContractAt("UmaResolutionManager", managerAddress);
  const assertionCurrency = await manager.assertionCurrency();
  const optimisticOracle = await ethers.getContractAt("OptimisticOracleV3Interface", await manager.optimisticOracle());
  const bond = await optimisticOracle.getMinimumBond(assertionCurrency);

  if (bond > BigInt(0)) {
    const token = await ethers.getContractAt("IERC20", assertionCurrency);
    const approval = await token.approve(managerAddress, bond);
    await approval.wait();
  }

  const claimBytes = ethers.toUtf8Bytes(claim);
  const assertionId = await manager.assertMarketResult.staticCall(marketAddress, result.side, result.invalid, claimBytes);
  const tx = await manager.assertMarketResult(marketAddress, result.side, result.invalid, claimBytes);
  const receipt = await tx.wait();

  console.log(JSON.stringify({
    market: marketAddress,
    resolutionManager: managerAddress,
    assertionId,
    result: result.invalid ? "invalid" : result.side === 0 ? "ride" : "fade",
    bond: bond.toString(),
    txHash: receipt?.hash
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
