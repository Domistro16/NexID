import hre from "hardhat";

const { ethers } = hre;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const factoryAddress = ethers.getAddress(required("OBSOLETE_NATIVE_MARKET_FACTORY_ADDRESS"));
  const factory = await ethers.getContractAt("MarketFactory", factoryAddress);
  const pauserRole = await factory.PAUSER_ROLE();
  const deployerCanPause = await factory.hasRole(pauserRole, deployer.address);
  if (!deployerCanPause) {
    throw new Error(`Signer ${deployer.address} does not have PAUSER_ROLE on ${factoryAddress}.`);
  }

  const beforePaused = await factory.paused();
  let txHash: string | null = null;
  if (!beforePaused) {
    const tx = await factory.pause();
    txHash = tx.hash;
    await tx.wait();
  }

  console.log(JSON.stringify({
    network: "base",
    deployer: deployer.address,
    marketFactory: factoryAddress,
    beforePaused,
    afterPaused: await factory.paused(),
    txHash
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
