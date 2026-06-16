import hre from "hardhat";
import { nexMarketsChainIdForNetwork, nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

function configured(name: string, fallback?: string) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const [admin] = await ethers.getSigners();
  const chainId = nexMarketsChainIdForNetwork(hre.network.name);
  const contracts = nexMarketsContracts(chainId);
  const executorAddress = configured(
    "NATIVE_TARGET_ORDER_EXECUTOR_ADDRESS",
    contracts?.targetOrderExecutor ?? process.env.NEXT_PUBLIC_NATIVE_TARGET_ORDER_EXECUTOR_ADDRESS
  );
  const botAddress = configured("NATIVE_TARGET_ORDER_EXECUTOR_BOT_ADDRESS", process.env.NATIVE_RESOLUTION_BOT_ADDRESS);
  const executor = await ethers.getContractAt("NativeTargetOrderExecutor", executorAddress);

  const defaultAdminRole = await executor.DEFAULT_ADMIN_ROLE();
  const adminCanGrant = await executor.hasRole(defaultAdminRole, admin.address);
  if (!adminCanGrant) {
    throw new Error(`Signer ${admin.address} is missing DEFAULT_ADMIN_ROLE on ${executorAddress}`);
  }

  const role = await executor.EXECUTOR_ROLE();
  const alreadyHadRole = await executor.hasRole(role, botAddress);
  let txHash: string | undefined;
  if (!alreadyHadRole) {
    const tx = await executor.grantRole(role, botAddress);
    const receipt = await tx.wait();
    txHash = receipt?.hash;
  }

  console.log(JSON.stringify({
    targetOrderExecutor: executorAddress,
    admin: admin.address,
    botAddress,
    role: "EXECUTOR_ROLE",
    granted: !alreadyHadRole,
    alreadyHadRole,
    txHash
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
