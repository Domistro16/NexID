import { cleanIdName } from "@/lib/server/validation";
import { base, baseSepolia } from "viem/chains";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  namehash,
  stringToBytes,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const AUTHORIZATION_DOMAIN_NAME = "NexMarketsEdgeRewardDistributor";
const AUTHORIZATION_DOMAIN_VERSION = "1";
const DEFAULT_AUTHORIZATION_TTL_SECONDS = 15 * 60;

export const edgeRewardDistributorAbi = [
  {
    inputs: [
      {
        components: [
          { name: "account", type: "address" },
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "idNameHash", type: "bytes32" },
          { name: "authorizationId", type: "bytes32" },
          { name: "action", type: "uint8" },
          { name: "deadline", type: "uint256" }
        ],
        name: "authorization",
        type: "tuple"
      },
      { name: "signature", type: "bytes" }
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          { name: "account", type: "address" },
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "idNameHash", type: "bytes32" },
          { name: "authorizationId", type: "bytes32" },
          { name: "action", type: "uint8" },
          { name: "deadline", type: "uint256" }
        ],
        name: "authorization",
        type: "tuple"
      },
      { name: "signature", type: "bytes" }
    ],
    name: "spendForIdMint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

const rewardAuthorizationTypes = {
  RewardAuthorization: [
    { name: "account", type: "address" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "idNameHash", type: "bytes32" },
    { name: "authorizationId", type: "bytes32" },
    { name: "action", type: "uint8" },
    { name: "deadline", type: "uint256" }
  ]
} as const;

export type EdgeRewardAction = "claim" | "spend_id_mint";

export type EdgeRewardAuthorizationPayload = {
  distributorAddress: Address;
  chainId: number;
  authorization: {
    account: Address;
    recipient: Address;
    amount: string;
    idNameHash: Hex;
    authorizationId: Hex;
    action: number;
    deadline: string;
  };
  signature: Hex;
};

function normalizePrivateKey(name: string, value: string | undefined): Hex {
  const normalized = value?.trim().startsWith("0x") ? value.trim() : value?.trim() ? `0x${value.trim()}` : "";
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error(`${name} must be a 32-byte private key.`);
  }
  return normalized as Hex;
}

function authorizerPrivateKey() {
  return normalizePrivateKey("EDGE_REWARD_AUTHORIZER_PRIVATE_KEY", process.env.EDGE_REWARD_AUTHORIZER_PRIVATE_KEY);
}

function relayerPrivateKey() {
  return normalizePrivateKey("NEXDOMAINS_RELAYER_PRIVATE_KEY", process.env.NEXDOMAINS_RELAYER_PRIVATE_KEY);
}

export function edgeRewardDistributorAddress() {
  const value = process.env.EDGE_REWARD_DISTRIBUTOR_ADDRESS?.trim();
  if (!value || !isAddress(value)) return null;
  return getAddress(value) as Address;
}

export function edgeRewardDistributorConfigured() {
  return Boolean(edgeRewardDistributorAddress() && process.env.EDGE_REWARD_AUTHORIZER_PRIVATE_KEY);
}

function edgeRewardChainId() {
  return Number(process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || process.env.NATIVE_EVENTS_CHAIN_ID || process.env.NEXDOMAINS_CHAIN_ID || "8453");
}

function edgeRewardChain() {
  return edgeRewardChainId() === baseSepolia.id ? baseSepolia : base;
}

function edgeRewardRpcUrl() {
  return edgeRewardChainId() === baseSepolia.id
    ? process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"
    : process.env.BASE_RPC_URL || "https://mainnet.base.org";
}

function tokenDecimals() {
  return Number(process.env.EDGE_REWARD_TOKEN_DECIMALS || "6");
}

function actionCode(action: EdgeRewardAction) {
  return action === "claim" ? 1 : 2;
}

function amountUsdToAtomic(amountUsd: number) {
  const decimals = tokenDecimals();
  const scale = 10 ** Math.min(decimals, 8);
  const rounded = BigInt(Math.round(amountUsd * scale));
  return decimals > 8 ? rounded * (BigInt(10) ** BigInt(decimals - 8)) : rounded;
}

function idNameHash(idName: string) {
  const clean = cleanIdName(idName.replace(/\.id$/i, ""));
  if (!clean) throw new Error("Active .id name is required for reward authorization.");
  return namehash(`${clean}.id`) as Hex;
}

function authorizationId(referenceId: string, action: EdgeRewardAction) {
  return keccak256(stringToBytes(`${referenceId}:${action}`));
}

export async function signEdgeRewardAuthorization(input: {
  action: EdgeRewardAction;
  account: string;
  recipient: string;
  amountUsd: number;
  idName: string;
  referenceId: string;
}): Promise<EdgeRewardAuthorizationPayload> {
  const distributorAddress = edgeRewardDistributorAddress();
  if (!distributorAddress) throw new Error("EDGE_REWARD_DISTRIBUTOR_ADDRESS is required for EdgeBoard reward releases.");
  if (!isAddress(input.account)) throw new Error("Reward account address is invalid.");
  if (!isAddress(input.recipient)) throw new Error("Reward recipient address is invalid.");

  const account = privateKeyToAccount(authorizerPrivateKey());
  const expectedAuthorizer = process.env.EDGE_REWARD_AUTHORIZER_ADDRESS;
  if (expectedAuthorizer && getAddress(expectedAuthorizer) !== account.address) {
    throw new Error("EDGE_REWARD_AUTHORIZER_ADDRESS does not match EDGE_REWARD_AUTHORIZER_PRIVATE_KEY.");
  }

  const chainId = edgeRewardChainId();
  const message = {
    account: getAddress(input.account) as Address,
    recipient: getAddress(input.recipient) as Address,
    amount: amountUsdToAtomic(input.amountUsd),
    idNameHash: idNameHash(input.idName),
    authorizationId: authorizationId(input.referenceId, input.action),
    action: actionCode(input.action),
    deadline: BigInt(Math.floor(Date.now() / 1000) + DEFAULT_AUTHORIZATION_TTL_SECONDS)
  };
  const signature = await account.signTypedData({
    domain: {
      name: AUTHORIZATION_DOMAIN_NAME,
      version: AUTHORIZATION_DOMAIN_VERSION,
      chainId,
      verifyingContract: distributorAddress
    },
    types: rewardAuthorizationTypes,
    primaryType: "RewardAuthorization",
    message
  });

  return {
    distributorAddress,
    chainId,
    authorization: {
      account: message.account,
      recipient: message.recipient,
      amount: message.amount.toString(),
      idNameHash: message.idNameHash,
      authorizationId: message.authorizationId,
      action: message.action,
      deadline: message.deadline.toString()
    },
    signature
  };
}

function contractAuthorization(payload: EdgeRewardAuthorizationPayload["authorization"]) {
  return {
    account: payload.account,
    recipient: payload.recipient,
    amount: BigInt(payload.amount),
    idNameHash: payload.idNameHash,
    authorizationId: payload.authorizationId,
    action: payload.action,
    deadline: BigInt(payload.deadline)
  };
}

export async function relayEdgeRewardSpendForIdMint(input: {
  account: string;
  recipient: string;
  amountUsd: number;
  idName: string;
  referenceId: string;
}) {
  if (input.amountUsd <= 0) return null;
  const signed = await signEdgeRewardAuthorization({ ...input, action: "spend_id_mint" });
  const account = privateKeyToAccount(relayerPrivateKey());
  const client = createWalletClient({
    account,
    chain: edgeRewardChain(),
    transport: http(edgeRewardRpcUrl())
  });
  const txHash = await client.writeContract({
    address: signed.distributorAddress,
    abi: edgeRewardDistributorAbi,
    functionName: "spendForIdMint",
    args: [contractAuthorization(signed.authorization), signed.signature]
  });
  return { txHash, authorization: signed };
}

export async function confirmEdgeRewardDistributorTransaction(txHash: string) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error("Invalid reward distributor transaction hash.");
  const client = createPublicClient({
    chain: edgeRewardChain(),
    transport: http(edgeRewardRpcUrl())
  });
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash as Hex,
    confirmations: 1,
    timeout: 120_000
  });
  if (receipt.status !== "success") throw new Error("Reward distributor transaction failed.");
  return { txHash, blockNumber: receipt.blockNumber.toString(), status: receipt.status };
}
