import hre from "hardhat";

const { ethers, network } = hre;

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
  const rewardToken = required(collateralEnvName());
  const rewardAuthorizer = required("EDGE_REWARD_AUTHORIZER_ADDRESS");

  const distributor = await (await ethers.getContractFactory("EdgeRewardDistributor")).deploy(
    rewardToken,
    deployer.address,
    rewardAuthorizer
  );
  await distributor.waitForDeployment();
  const distributorAddress = await distributor.getAddress();

  console.log(JSON.stringify({
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    rewardToken,
    rewardAuthorizer,
    edgeRewardDistributor: distributorAddress,
    env: {
      EDGE_REWARD_DISTRIBUTOR_ADDRESS: distributorAddress
    },
    nextStep: "Set EDGE_REWARD_DISTRIBUTOR_ADDRESS only if EdgeBoard rewards are being re-enabled. Current FeeRouter trading fees do not route to this distributor."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
