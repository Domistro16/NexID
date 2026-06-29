import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import { createPublicClient, createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const accessControlAbi = [
  {
    type: "function",
    name: "DEFAULT_ADMIN_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "address" }],
    outputs: [{ type: "bool" }]
  }
];

const feeRouterRecipientAbi = [
  ...accessControlAbi,
  {
    type: "function",
    name: "platformTreasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "buybackBurnAddress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "getProvers",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }]
  },
  {
    type: "function",
    name: "setRecipients",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "address" }, { type: "address[]" }],
    outputs: []
  }
];

const launchStakeVaultRecipientAbi = [
  ...accessControlAbi,
  {
    type: "function",
    name: "protocolTreasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "rewardsPool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "securityPool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "setRecipients",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "address" }, { type: "address" }],
    outputs: []
  }
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalAddress(name) {
  const value = process.env[name]?.trim();
  return value ? getAddress(value) : undefined;
}

function requiredAddress(name) {
  return getAddress(required(name));
}

function requiredAddressList(name, expectedLength) {
  const addresses = required(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => getAddress(value));

  if (addresses.length !== expectedLength) {
    throw new Error(`${name} must contain exactly ${expectedLength} comma-separated addresses.`);
  }

  if (new Set(addresses.map((value) => value.toLowerCase())).size !== addresses.length) {
    throw new Error(`${name} contains duplicate addresses.`);
  }

  return addresses;
}

function normalizePrivateKey(value) {
  const key = value.trim();
  return key.startsWith("0x") ? key : `0x${key}`;
}

function networkConfig(networkName) {
  if (networkName === "base") {
    return { name: "base", chain: base, rpcUrl: required("BASE_RPC_URL") };
  }
  if (networkName === "baseSepolia") {
    return { name: "baseSepolia", chain: baseSepolia, rpcUrl: required("BASE_SEPOLIA_RPC_URL") };
  }
  throw new Error("Usage: node scripts/set-safe-pool-recipients.mjs baseSepolia|base");
}

function sameAddress(left, right) {
  return getAddress(left).toLowerCase() === getAddress(right).toLowerCase();
}

function sameAddressList(left, right) {
  return left.length === right.length && left.every((address, index) => sameAddress(address, right[index]));
}

async function currentFeeRouterRecipients(publicClient, address) {
  const [platformTreasury, buybackBurnAddress, provers] = await Promise.all([
    publicClient.readContract({ address, abi: feeRouterRecipientAbi, functionName: "platformTreasury" }),
    publicClient.readContract({ address, abi: feeRouterRecipientAbi, functionName: "buybackBurnAddress" }),
    publicClient.readContract({ address, abi: feeRouterRecipientAbi, functionName: "getProvers" })
  ]);
  return { platformTreasury, buybackBurnAddress, provers };
}

async function currentLaunchStakeVaultRecipients(publicClient, address) {
  const [protocolTreasury, rewardsPool, securityPool] = await Promise.all([
    publicClient.readContract({ address, abi: launchStakeVaultRecipientAbi, functionName: "protocolTreasury" }),
    publicClient.readContract({ address, abi: launchStakeVaultRecipientAbi, functionName: "rewardsPool" }),
    publicClient.readContract({ address, abi: launchStakeVaultRecipientAbi, functionName: "securityPool" })
  ]);
  return { protocolTreasury, rewardsPool, securityPool };
}

function recipientsMatch(kind, current, next) {
  if (kind === "feeRouter") {
    return sameAddress(current.platformTreasury, next.platformTreasury)
      && sameAddress(current.buybackBurnAddress, next.buybackBurnAddress)
      && sameAddressList(current.provers, next.provers);
  }

  return sameAddress(current.protocolTreasury, next.protocolTreasury)
    && sameAddress(current.rewardsPool, next.rewardsPool)
    && sameAddress(current.securityPool, next.securityPool);
}

async function currentRecipients(kind, publicClient, address) {
  return kind === "feeRouter"
    ? currentFeeRouterRecipients(publicClient, address)
    : currentLaunchStakeVaultRecipients(publicClient, address);
}

async function waitForRecipientUpdate(kind, publicClient, address, nextRecipients) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await currentRecipients(kind, publicClient, address);
    if (recipientsMatch(kind, current, nextRecipients)) return current;
    await delay(1200);
  }

  return currentRecipients(kind, publicClient, address);
}

async function updateRecipientContract({ label, kind, address, account, publicClient, walletClient, nextRecipients }) {
  const abi = kind === "feeRouter" ? feeRouterRecipientAbi : launchStakeVaultRecipientAbi;
  const current = await currentRecipients(kind, publicClient, address);
  const defaultAdminRole = await publicClient.readContract({ address, abi, functionName: "DEFAULT_ADMIN_ROLE" });
  const hasAdmin = await publicClient.readContract({
    address,
    abi,
    functionName: "hasRole",
    args: [defaultAdminRole, account.address]
  });

  if (!hasAdmin) {
    throw new Error(`${account.address} is missing DEFAULT_ADMIN_ROLE on ${label} ${address}`);
  }

  if (recipientsMatch(kind, current, nextRecipients)) {
    return {
      label,
      address,
      status: "already_set",
      txHash: null,
      previous: current,
      next: nextRecipients
    };
  }

  const args = kind === "feeRouter"
    ? [nextRecipients.platformTreasury, nextRecipients.buybackBurnAddress, nextRecipients.provers]
    : [nextRecipients.protocolTreasury, nextRecipients.rewardsPool, nextRecipients.securityPool];

  const hash = await walletClient.writeContract({
    account,
    address,
    abi,
    functionName: "setRecipients",
    args,
    chain: walletClient.chain
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} setRecipients failed: ${hash}`);

  return {
    label,
    address,
    status: "updated",
    txHash: hash,
    previous: current,
    next: await waitForRecipientUpdate(kind, publicClient, address, nextRecipients)
  };
}

async function main() {
  const networkName = process.argv[2] || process.env.SAFE_NETWORK || "baseSepolia";
  const network = networkConfig(networkName);
  const account = privateKeyToAccount(normalizePrivateKey(required("DEPLOYER_PRIVATE_KEY")));
  const protocolTreasury = requiredAddress("PROTOCOL_TREASURY_ADDRESS");
  const feeRouterRecipients = {
    platformTreasury: protocolTreasury,
    buybackBurnAddress: requiredAddress("BUYBACK_BURN_SAFE_ADDRESS"),
    provers: requiredAddressList("NATIVE_GENESIS_PROVER_ADDRESSES", 5)
  };
  const launchStakeVaultRecipients = {
    protocolTreasury,
    rewardsPool: optionalAddress("REWARDS_POOL_ADDRESS") || protocolTreasury,
    securityPool: requiredAddress("SECURITY_POOL_ADDRESS")
  };
  const contracts = [
    {
      label: "FeeRouter",
      kind: "feeRouter",
      address: requiredAddress("NATIVE_FEE_ROUTER_ADDRESS"),
      nextRecipients: feeRouterRecipients
    },
    {
      label: "LaunchStakeVault",
      kind: "launchStakeVault",
      address: requiredAddress("NATIVE_LAUNCH_STAKE_VAULT_ADDRESS"),
      nextRecipients: launchStakeVaultRecipients
    }
  ];
  const publicClient = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
  const walletClient = createWalletClient({ account, chain: network.chain, transport: http(network.rpcUrl) });

  const results = [];
  for (const contract of contracts) {
    results.push(await updateRecipientContract({
      ...contract,
      account,
      publicClient,
      walletClient
    }));
  }

  console.log(JSON.stringify({
    network: network.name,
    chainId: network.chain.id,
    signer: account.address,
    recipients: {
      feeRouter: feeRouterRecipients,
      launchStakeVault: launchStakeVaultRecipients
    },
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
