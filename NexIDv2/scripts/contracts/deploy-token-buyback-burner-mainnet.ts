import hre from "hardhat";
import { nexMarketsContracts } from "../../config/nexmarkets-contracts.ts";

const { ethers } = hre;

const BASE_VIRTUALS = {
  bondingV5: "0x1a540088125d00dd3990f9da45ca0859af4d3b01",
  fRouterV3: "0x02fe8ec3d9bbf7318eb54590bcc39198a8b47ded",
  virtual: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
  weth: "0x4200000000000000000000000000000000000006",
  swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481"
} as const;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredAddress(name: string) {
  return ethers.getAddress(required(name));
}

function optionalAddress(name: string) {
  const value = process.env[name]?.trim();
  return value ? ethers.getAddress(value) : undefined;
}

function optionalAddressWithDefault(name: string, fallback: string) {
  return optionalAddress(name) ?? ethers.getAddress(fallback);
}

function optionalUint24(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new Error(`${name} must be a uint24-compatible integer.`);
  }
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const currentConfig = nexMarketsContracts(8453);

  const collateral = optionalAddress("TOKEN_BUYBACK_COLLATERAL_ADDRESS")
    ?? (currentConfig?.collateral ? ethers.getAddress(currentConfig.collateral) : requiredAddress("USDC_BASE_MAINNET"));
  const feeRouterAddress = optionalAddress("NATIVE_FEE_ROUTER_ADDRESS")
    ?? (currentConfig?.feeRouter ? ethers.getAddress(currentConfig.feeRouter) : undefined);
  if (!feeRouterAddress) {
    throw new Error("NATIVE_FEE_ROUTER_ADDRESS is required when config/nexmarkets-contracts.ts has no Base feeRouter.");
  }

  const targetToken = requiredAddress("TOKEN_BUYBACK_TARGET_TOKEN_ADDRESS");
  const buybackSafe = requiredAddress("BUYBACK_BURN_SAFE_ADDRESS");
  const finalOwner = optionalAddress("TOKEN_BUYBACK_BURNER_OWNER_ADDRESS") ?? deployer.address;

  const swapRouter02 = optionalAddressWithDefault("VIRTUALS_SWAP_ROUTER02_ADDRESS", BASE_VIRTUALS.swapRouter02);
  const bondingV5 = optionalAddressWithDefault("VIRTUALS_BONDING_V5_ADDRESS", BASE_VIRTUALS.bondingV5);
  const fRouterV3 = optionalAddressWithDefault("VIRTUALS_FROUTER_V3_ADDRESS", BASE_VIRTUALS.fRouterV3);
  const virtualToken = optionalAddressWithDefault("VIRTUALS_TOKEN_ADDRESS", BASE_VIRTUALS.virtual);
  const weth = optionalAddressWithDefault("VIRTUALS_WETH_ADDRESS", BASE_VIRTUALS.weth);
  const collateralWethFee = optionalUint24("VIRTUALS_COLLATERAL_WETH_POOL_FEE", 500);
  const wethVirtualFee = optionalUint24("VIRTUALS_WETH_VIRTUAL_POOL_FEE", 500);
  const genericV3PoolFee = optionalUint24("TOKEN_BUYBACK_V3_POOL_FEE", 10_000);

  const TokenBuybackBurner = await ethers.getContractFactory("TokenBuybackBurner");
  const burner = await TokenBuybackBurner.deploy(
    deployer.address,
    collateral,
    targetToken,
    swapRouter02,
    buybackSafe,
    feeRouterAddress
  );
  await burner.waitForDeployment();
  const burnerAddress = await burner.getAddress();

  await (await burner.setV3PoolFee(genericV3PoolFee)).wait();
  await (await burner.setVirtualToken(virtualToken)).wait();
  await (await burner.setBondingContract(bondingV5)).wait();
  await (await burner.setVirtualsBondingSpender(fRouterV3)).wait();
  await (await burner.setVirtualsSwapConfig(weth, collateralWethFee, wethVirtualFee)).wait();
  await (await burner.setSwapType(3)).wait(); // SwapType.VirtualsBonding

  let feeRouterUpdated = false;
  let platformTreasury: string | null = null;
  let genesisProvers: string[] | null = null;
  if ((process.env.UPDATE_FEE_ROUTER_BUYBACK_RECIPIENT ?? "").toLowerCase() === "true") {
    const feeRouter = await ethers.getContractAt("FeeRouter", feeRouterAddress);
    platformTreasury = await feeRouter.platformTreasury();
    genesisProvers = Array.from(await feeRouter.getProvers());
    await (await feeRouter.setRecipients(platformTreasury, burnerAddress, genesisProvers)).wait();
    feeRouterUpdated = true;
  }

  if (finalOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await burner.transferOwnership(finalOwner)).wait();
  }

  console.log(JSON.stringify({
    network: "base",
    deployer: deployer.address,
    tokenBuybackBurner: burnerAddress,
    owner: finalOwner,
    collateral,
    targetToken,
    buybackSafe,
    authorizedFeeRouter: feeRouterAddress,
    feeRouterUpdated,
    feeRouterUpdateMode: "set UPDATE_FEE_ROUTER_BUYBACK_RECIPIENT=true to update FeeRouter during deployment",
    platformTreasury,
    genesisProvers,
    virtuals: {
      swapType: "VirtualsBonding",
      swapRouter02,
      bondingV5,
      fRouterV3,
      virtualToken,
      weth,
      collateralWethFee,
      wethVirtualFee,
      genericV3PoolFee
    },
    configUpdateRequired: {
      file: "config/nexmarkets-contracts.ts",
      baseTokenBuybackBurner: burnerAddress
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
