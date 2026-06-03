import "dotenv/config";
import Safe from "@safe-global/protocol-kit";
import { createPublicClient, getAddress, http, isAddress, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const WALLET_SPECS = [
  { key: "protocolTreasury", name: "NexMarkets Protocol Treasury Safe" },
  { key: "securityPool", name: "NexMarkets Security Pool Safe" }
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizePrivateKey(value) {
  const key = value.trim();
  return key.startsWith("0x") ? key : `0x${key}`;
}

function uniqueAddresses(values) {
  const seen = new Set();
  const addresses = [];

  for (const value of values) {
    const address = getAddress(value.trim());
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push(address);
  }

  return addresses;
}

function ownerAddresses(deployerAddress) {
  const configured = process.env.MULTISIG_OWNER_ADDRESSES?.trim();
  if (!configured) return [deployerAddress];

  const owners = uniqueAddresses(configured.split(/[,\s]+/).filter(Boolean));
  if (!owners.length) throw new Error("MULTISIG_OWNER_ADDRESSES did not contain any valid owner addresses.");
  return owners;
}

function networkConfig(networkName) {
  if (networkName === "base") {
    return {
      name: "base",
      chain: base,
      rpcUrl: required("BASE_RPC_URL")
    };
  }

  if (networkName === "baseSepolia") {
    return {
      name: "baseSepolia",
      chain: baseSepolia,
      rpcUrl: required("BASE_SEPOLIA_RPC_URL")
    };
  }

  throw new Error("Usage: node scripts/deploy-safe-pool-wallets.mjs baseSepolia|base");
}

function safeSaltNonce(networkName, walletKey) {
  const prefix = process.env.SAFE_SALT_NONCE_PREFIX || "nexmarkets-pool-safes-v1";
  return BigInt(keccak256(stringToHex(`${prefix}:${networkName}:${walletKey}`))).toString();
}

async function deploySafe({ spec, network, signerPrivateKey, owners, threshold, publicClient, dryRun }) {
  const predictedSafe = {
    safeAccountConfig: {
      owners,
      threshold
    },
    safeDeploymentConfig: {
      saltNonce: safeSaltNonce(network.name, spec.key)
    }
  };

  const protocolKit = await Safe.init({
    provider: network.rpcUrl,
    signer: signerPrivateKey,
    predictedSafe
  });

  const safeAddress = await protocolKit.getAddress();
  const bytecode = await publicClient.getCode({ address: safeAddress });

  if (bytecode && bytecode !== "0x") {
    return {
      key: spec.key,
      name: spec.name,
      address: safeAddress,
      status: "already_deployed",
      owners: await protocolKit.getOwners().catch(() => owners),
      threshold: await protocolKit.getThreshold().catch(() => threshold),
      txHash: null
    };
  }

  if (dryRun) {
    return {
      key: spec.key,
      name: spec.name,
      address: safeAddress,
      status: "predicted",
      owners,
      threshold,
      txHash: null
    };
  }

  const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();
  const client = await protocolKit.getSafeProvider().getExternalSigner();
  const txHash = await client.sendTransaction({
    to: deploymentTransaction.to,
    value: BigInt(deploymentTransaction.value),
    data: deploymentTransaction.data,
    chain: network.chain
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    throw new Error(`${spec.name} deployment failed: ${txHash}`);
  }

  return {
    key: spec.key,
    name: spec.name,
    address: safeAddress,
    status: "deployed",
    owners: await protocolKit.getOwners().catch(() => owners),
    threshold: await protocolKit.getThreshold().catch(() => threshold),
    txHash
  };
}

async function main() {
  const networkName = process.argv[2] || process.env.SAFE_NETWORK || "baseSepolia";
  const dryRun = process.argv.includes("--dry-run") || process.env.SAFE_DRY_RUN === "true";
  const network = networkConfig(networkName);
  const signerPrivateKey = normalizePrivateKey(required("DEPLOYER_PRIVATE_KEY"));
  const deployer = privateKeyToAccount(signerPrivateKey);
  const owners = ownerAddresses(deployer.address);
  const threshold = Number(process.env.MULTISIG_THRESHOLD || (owners.length > 1 ? 2 : 1));

  if (!owners.every(isAddress)) throw new Error("One or more multisig owners are invalid addresses.");
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > owners.length) {
    throw new Error(`MULTISIG_THRESHOLD must be between 1 and ${owners.length}.`);
  }

  const publicClient = createPublicClient({
    chain: network.chain,
    transport: http(network.rpcUrl)
  });

  const deployments = [];
  for (const spec of WALLET_SPECS) {
    deployments.push(await deploySafe({
      spec,
      network,
      signerPrivateKey,
      owners,
      threshold,
      publicClient,
      dryRun
    }));
  }

  console.log(JSON.stringify({
    network: network.name,
    chainId: network.chain.id,
    deployer: deployer.address,
    owners,
    threshold,
    dryRun,
    custodyWarning: owners.length === 1
      ? "This deploys 1-of-1 Safes controlled only by the deployer key. Add more owners and raise threshold before holding meaningful funds."
      : null,
    safes: Object.fromEntries(deployments.map((item) => [item.key, item.address])),
    deployments,
    env: {
      PROTOCOL_TREASURY_ADDRESS: deployments.find((item) => item.key === "protocolTreasury")?.address,
      SECURITY_POOL_ADDRESS: deployments.find((item) => item.key === "securityPool")?.address
    },
    note: "Safes deployed only. Existing FeeRouter and LaunchStakeVault recipients were not changed. EdgeBoard rewards should use EDGE_REWARD_DISTRIBUTOR_ADDRESS, not a rewards Safe."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
