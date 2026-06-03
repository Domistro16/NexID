import hre from "hardhat";

const { ethers, network } = hre;

const erc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to,uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
] as const;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function collateralEnvName() {
  if (network.name === "baseSepolia") return "USDC_BASE_SEPOLIA";
  if (network.name === "base") return "USDC_BASE_MAINNET";
  return "EDGE_REWARD_TOKEN_ADDRESS";
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const distributorAddress = ethers.getAddress(required("EDGE_REWARD_DISTRIBUTOR_ADDRESS"));
  const tokenAddress = ethers.getAddress(required(collateralEnvName()));
  const amount = BigInt(process.env.EDGE_REWARD_TEST_FUND_ATOMIC || "1");
  if (amount <= BigInt(0)) throw new Error("EDGE_REWARD_TEST_FUND_ATOMIC must be greater than zero.");

  const token = await ethers.getContractAt(erc20Abi, tokenAddress);
  const [symbol, decimals, beforeDistributor, beforeDeployer] = await Promise.all([
    token.symbol().catch(() => "TOKEN"),
    token.decimals().catch(() => 6),
    token.balanceOf(distributorAddress),
    token.balanceOf(deployer.address)
  ]);
  if (beforeDeployer < amount) {
    throw new Error(`Deployer balance ${beforeDeployer.toString()} is below requested fund amount ${amount.toString()}.`);
  }

  const tx = await token.transfer(distributorAddress, amount);
  const receipt = await tx.wait();
  if (receipt?.status !== 1) throw new Error(`Funding transfer failed: ${tx.hash}`);

  const [afterDistributor, afterDeployer] = await Promise.all([
    token.balanceOf(distributorAddress),
    token.balanceOf(deployer.address)
  ]);

  console.log(JSON.stringify({
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    distributor: distributorAddress,
    token: { address: tokenAddress, symbol, decimals: Number(decimals) },
    amountAtomic: amount.toString(),
    txHash: tx.hash,
    before: {
      distributorBalanceAtomic: beforeDistributor.toString(),
      deployerBalanceAtomic: beforeDeployer.toString()
    },
    after: {
      distributorBalanceAtomic: afterDistributor.toString(),
      deployerBalanceAtomic: afterDeployer.toString()
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
