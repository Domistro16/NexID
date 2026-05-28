import hre from "hardhat";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const creator = process.env.TEST_CREATOR_WALLET || deployer.address;
  const collateralAddress = required("USDC_BASE_SEPOLIA");
  const mintAmount = ethers.parseUnits(process.env.TEST_CREATOR_USDC || "1000", 6);

  let minted = false;
  try {
    const collateral = await ethers.getContractAt("MockUSDC", collateralAddress);
    await (await collateral.mint(creator, mintAmount)).wait();
    minted = true;
  } catch {
    minted = false;
  }

  console.log(JSON.stringify({
    network: "baseSepolia",
    creator,
    mockUsdcMinted: minted,
    mockUsdcAmount: minted ? ethers.formatUnits(mintAmount, 6) : null,
    collateral: collateralAddress
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
