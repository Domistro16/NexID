import hre from "hardhat";
import { nexMarketsChainIdForNetwork, nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function grantIfMissing(manager: Awaited<ReturnType<typeof ethers.getContractAt>>, role: string, roleName: string, account: string) {
  const hasRole = await manager.hasRole(role, account);
  if (hasRole) return { roleName, granted: false, alreadyHadRole: true };
  const tx = await manager.grantRole(role, account);
  const receipt = await tx.wait();
  return { roleName, granted: true, alreadyHadRole: false, txHash: receipt?.hash };
}

async function main() {
  const [admin] = await ethers.getSigners();
  const managerAddress = nexMarketsContracts(nexMarketsChainIdForNetwork(hre.network.name))?.resolutionManager ?? required("NATIVE_RESOLUTION_MANAGER_ADDRESS");
  const botAddress = required("NATIVE_RESOLUTION_BOT_ADDRESS");
  const manager = await ethers.getContractAt("ResolutionManager", managerAddress);

  const defaultAdminRole = await manager.DEFAULT_ADMIN_ROLE();
  const adminCanGrant = await manager.hasRole(defaultAdminRole, admin.address);
  if (!adminCanGrant) {
    throw new Error(`Signer ${admin.address} is missing DEFAULT_ADMIN_ROLE on ${managerAddress}`);
  }

  const resolverRole = await manager.RESOLVER_ROLE();
  const disputerRole = await manager.DISPUTER_ROLE();
  const grants = [
    await grantIfMissing(manager, resolverRole, "RESOLVER_ROLE", botAddress),
    await grantIfMissing(manager, disputerRole, "DISPUTER_ROLE", botAddress)
  ];

  console.log(JSON.stringify({
    resolutionManager: managerAddress,
    admin: admin.address,
    botAddress,
    grants
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
