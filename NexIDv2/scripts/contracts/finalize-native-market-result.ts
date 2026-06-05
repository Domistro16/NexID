import hre from "hardhat";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boolEnv(name: string) {
  return /^(1|true|yes)$/i.test(process.env[name] ?? "");
}

function resultSide(value?: string) {
  const normalized = (value ?? "ride").trim().toLowerCase();
  if (normalized === "ride" || normalized === "yes") return 0;
  if (normalized === "fade" || normalized === "no") return 1;
  throw new Error("NATIVE_MARKET_RESULT must be ride/yes or fade/no");
}

async function main() {
  const managerAddress = required("NATIVE_RESOLUTION_MANAGER_ADDRESS");
  const marketAddress = required("NATIVE_MARKET_CONTRACT_ADDRESS");
  const manager = await ethers.getContractAt("ResolutionManager", managerAddress);
  const invalid = boolEnv("NATIVE_MARKET_INVALID");
  const disputed = boolEnv("NATIVE_MARKET_DISPUTED");
  const side = resultSide(process.env.NATIVE_MARKET_RESULT);

  const tx = invalid
    ? await manager.markInvalid(marketAddress)
    : disputed
      ? await manager.finalizeDisputed(marketAddress, side, false)
      : await manager.finalizeUndisputed(marketAddress);
  const receipt = await tx.wait();

  console.log(JSON.stringify({
    mode: "proofflow",
    market: marketAddress,
    resolutionManager: managerAddress,
    result: invalid ? "invalid" : side === 0 ? "ride" : "fade",
    disputed,
    txHash: receipt?.hash
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
