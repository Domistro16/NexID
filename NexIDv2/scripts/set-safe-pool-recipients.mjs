import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import { createPublicClient, createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const recipientAbi = [
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
  },
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
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
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

async function currentRecipients(publicClient, address) {
  const [protocolTreasury, rewardsPool, securityPool] = await Promise.all([
    publicClient.readContract({ address, abi: recipientAbi, functionName: "protocolTreasury" }),
    publicClient.readContract({ address, abi: recipientAbi, functionName: "rewardsPool" }),
    publicClient.readContract({ address, abi: recipientAbi, functionName: "securityPool" })
  ]);
  return { protocolTreasury, rewardsPool, securityPool };
}

function recipientsMatch(current, next) {
  return sameAddress(current.protocolTreasury, next.protocolTreasury)
    && sameAddress(current.rewardsPool, next.rewardsPool)
    && sameAddress(current.securityPool, next.securityPool);
}

async function waitForRecipientUpdate(publicClient, address, nextRecipients) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await currentRecipients(publicClient, address);
    if (recipientsMatch(current, nextRecipients)) return current;
    await delay(1200);
  }

  return currentRecipients(publicClient, address);
}

async function updateRecipientContract({ label, address, account, publicClient, walletClient, nextRecipients }) {
  const current = await currentRecipients(publicClient, address);
  const defaultAdminRole = await publicClient.readContract({ address, abi: recipientAbi, functionName: "DEFAULT_ADMIN_ROLE" });
  const hasAdmin = await publicClient.readContract({
    address,
    abi: recipientAbi,
    functionName: "hasRole",
    args: [defaultAdminRole, account.address]
  });

  if (!hasAdmin) {
    throw new Error(`${account.address} is missing DEFAULT_ADMIN_ROLE on ${label} ${address}`);
  }

  if (recipientsMatch(current, nextRecipients)) {
    return {
      label,
      address,
      status: "already_set",
      txHash: null,
      previous: current,
      next: nextRecipients
    };
  }

  const hash = await walletClient.writeContract({
    account,
    address,
    abi: recipientAbi,
    functionName: "setRecipients",
    args: [
      nextRecipients.protocolTreasury,
      nextRecipients.rewardsPool,
      nextRecipients.securityPool
    ],
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
    next: await waitForRecipientUpdate(publicClient, address, nextRecipients)
  };
}

async function main() {
  const networkName = process.argv[2] || process.env.SAFE_NETWORK || "baseSepolia";
  const network = networkConfig(networkName);
  const account = privateKeyToAccount(normalizePrivateKey(required("DEPLOYER_PRIVATE_KEY")));
  const nextRecipients = {
    protocolTreasury: getAddress(required("PROTOCOL_TREASURY_ADDRESS")),
    rewardsPool: getAddress(required("REWARDS_POOL_ADDRESS")),
    securityPool: getAddress(required("SECURITY_POOL_ADDRESS"))
  };
  const contracts = [
    { label: "FeeRouter", address: getAddress(required("NATIVE_FEE_ROUTER_ADDRESS")) },
    { label: "LaunchStakeVault", address: getAddress(required("NATIVE_LAUNCH_STAKE_VAULT_ADDRESS")) }
  ];
  const publicClient = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
  const walletClient = createWalletClient({ account, chain: network.chain, transport: http(network.rpcUrl) });

  const results = [];
  for (const contract of contracts) {
    results.push(await updateRecipientContract({
      ...contract,
      account,
      publicClient,
      walletClient,
      nextRecipients
    }));
  }

  console.log(JSON.stringify({
    network: network.name,
    chainId: network.chain.id,
    signer: account.address,
    recipients: nextRecipients,
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
