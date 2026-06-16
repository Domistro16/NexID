import hre from "hardhat";
import { nexMarketsChainIdForNetwork, nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const managerAddress = nexMarketsContracts(nexMarketsChainIdForNetwork(hre.network.name))?.resolutionManager ?? required("NATIVE_RESOLUTION_MANAGER_ADDRESS");
  const assertionId = required("UMA_ASSERTION_ID");
  const manager = await ethers.getContractAt("UmaResolutionManager", managerAddress);
  const tx = await manager.settleAssertion(assertionId);
  const receipt = await tx.wait();

  console.log(JSON.stringify({
    resolutionManager: managerAddress,
    assertionId,
    txHash: receipt?.hash
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
