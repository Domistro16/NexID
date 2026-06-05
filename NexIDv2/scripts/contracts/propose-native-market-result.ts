import hre from "hardhat";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function resultSide(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ride" || normalized === "yes") return 0;
  if (normalized === "fade" || normalized === "no") return 1;
  throw new Error("NATIVE_MARKET_RESULT must be ride/yes or fade/no. Use the finalize script with NATIVE_MARKET_INVALID=true for INVALID / REFUND.");
}

async function main() {
  const managerAddress = required("NATIVE_RESOLUTION_MANAGER_ADDRESS");
  const marketAddress = required("NATIVE_MARKET_CONTRACT_ADDRESS");
  const side = resultSide(required("NATIVE_MARKET_RESULT"));
  const manager = await ethers.getContractAt("ResolutionManager", managerAddress);
  const tx = await manager.proposeResult(marketAddress, side);
  const receipt = await tx.wait();

  console.log(JSON.stringify({
    mode: "proofflow",
    market: marketAddress,
    resolutionManager: managerAddress,
    result: side === 0 ? "ride" : "fade",
    txHash: receipt?.hash
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
