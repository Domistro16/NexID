import hre from "hardhat";

const { ethers } = hre;

const BASE_DEFAULTS = {
  token: "0xbeFDdb0982c04008258EA6f98806eA4286719B6C",
  agentRegistrar: "0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494",
  referralVerifier: "0x212c27756529679efBd46cb35440b2e4DC28e33C",
  reverseRegistrar: "0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA",
  publicResolver: "0x0a8C0f71C3Ec3FC8cB59F27885eb52C033780b6f",
  burnAddress: "0x000000000000000000000000000000000000dEaD"
} as const;

const erc20MetadataAbi = [
  "function decimals() view returns (uint8)"
] as const;

const ownableAbi = [
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)"
] as const;

const reverseRegistrarAbi = [
  "function owner() view returns (address)",
  "function setController(address controller, bool allowed)"
] as const;

function optional(name: string) {
  return process.env[name]?.trim();
}

function required(name: string) {
  const value = optional(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function addressValue(name: string, fallback?: string) {
  const value = optional(name) || fallback;
  if (!value) throw new Error(`${name} is required`);
  return ethers.getAddress(value);
}

function boolValue(name: string) {
  return ["1", "true", "yes"].includes((optional(name) || "").toLowerCase());
}

async function tokenAmount(token: string) {
  const raw = required("NEX_TOKEN_DOMAIN_MINT_PRICE");
  const erc20 = await ethers.getContractAt(erc20MetadataAbi, token);
  const decimals = await erc20.decimals();
  return ethers.parseUnits(raw, decimals);
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const token = addressValue("NEX_TOKEN_DOMAIN_TOKEN_ADDRESS", BASE_DEFAULTS.token);
  const agentRegistrar = addressValue(
    "NEX_TOKEN_DOMAIN_AGENT_REGISTRAR_ADDRESS",
    optional("NEXDOMAINS_CONTROLLER_ADDRESS") || BASE_DEFAULTS.agentRegistrar
  );
  const referralVerifier = addressValue("NEX_TOKEN_DOMAIN_REFERRAL_VERIFIER_ADDRESS", BASE_DEFAULTS.referralVerifier);
  const reverseRegistrar = addressValue(
    "NEX_TOKEN_DOMAIN_REVERSE_REGISTRAR_ADDRESS",
    optional("NEXDOMAINS_REVERSE_REGISTRAR_ADDRESS") || BASE_DEFAULTS.reverseRegistrar
  );
  const publicResolver = addressValue(
    "NEX_TOKEN_DOMAIN_PUBLIC_RESOLVER_ADDRESS",
    optional("NEXDOMAINS_PUBLIC_RESOLVER_ADDRESS") || BASE_DEFAULTS.publicResolver
  );
  const burnAddress = addressValue("NEX_TOKEN_DOMAIN_BURN_ADDRESS", BASE_DEFAULTS.burnAddress);
  const finalOwner = addressValue("NEX_TOKEN_DOMAIN_MINTER_OWNER_ADDRESS", deployer.address);
  const mintPrice = await tokenAmount(token);

  const NexTokenDomainMinter = await ethers.getContractFactory("NexTokenDomainMinter");
  const minter = await NexTokenDomainMinter.deploy(
    deployer.address,
    token,
    agentRegistrar,
    referralVerifier,
    reverseRegistrar,
    publicResolver,
    burnAddress,
    mintPrice
  );
  await minter.waitForDeployment();
  const minterAddress = await minter.getAddress();

  const controller = await ethers.getContractAt(ownableAbi, agentRegistrar);
  const controllerOwnerBefore = await controller.owner();
  let controllerOwnershipTransferred = false;
  if (boolValue("TRANSFER_AGENT_REGISTRAR_OWNERSHIP_TO_MINTER")) {
    if (controllerOwnerBefore.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new Error(`Deployer ${deployer.address} is not AgentRegistrarController owner ${controllerOwnerBefore}.`);
    }
    await (await controller.transferOwnership(minterAddress)).wait();
    controllerOwnershipTransferred = true;
  }

  const reverse = await ethers.getContractAt(reverseRegistrarAbi, reverseRegistrar);
  const reverseOwnerBefore = await reverse.owner().catch(() => null);
  let reverseControllerSet = false;
  if (boolValue("SET_TOKEN_DOMAIN_MINTER_AS_REVERSE_CONTROLLER")) {
    if (!reverseOwnerBefore || reverseOwnerBefore.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new Error(`Deployer ${deployer.address} is not ReverseRegistrar owner ${reverseOwnerBefore ?? "unknown"}.`);
    }
    await (await reverse.setController(minterAddress, true)).wait();
    reverseControllerSet = true;
  }

  if (finalOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await minter.transferOwnership(finalOwner)).wait();
  }

  console.log(JSON.stringify({
    network: "base",
    deployer: deployer.address,
    nexTokenDomainMinter: minterAddress,
    owner: finalOwner,
    token,
    mintPrice: mintPrice.toString(),
    mintPriceInput: required("NEX_TOKEN_DOMAIN_MINT_PRICE"),
    agentRegistrar,
    controllerOwnerBefore,
    controllerOwnershipTransferred,
    referralVerifier,
    reverseRegistrar,
    reverseOwnerBefore,
    reverseControllerSet,
    publicResolver,
    burnAddress,
    requiredPostDeployActions: {
      transferAgentRegistrarOwnership: controllerOwnershipTransferred
        ? "done"
        : `Call AgentRegistrarController.transferOwnership(${minterAddress}) when ready.`,
      setReverseController: reverseControllerSet
        ? "done"
        : `Call ReverseRegistrar.setController(${minterAddress}, true) if token mints should set reverse records.`
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
