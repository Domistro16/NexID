import { createPublicClient, encodeFunctionData, http, namehash, zeroAddress, zeroHash, type Hash } from "viem";
import { base } from "viem/chains";
import { buildAppUrl } from "@/lib/appBaseUrl";
import { cleanReferralCode } from "@/lib/referrals";

const nexDomainsBaseUrl = process.env.NEXDOMAINS_API_BASE_URL;
const chainId = Number(process.env.NEXDOMAINS_CHAIN_ID || "8453");
const controllerAddress = (process.env.NEXDOMAINS_CONTROLLER_ADDRESS || "0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494") as `0x${string}`;
const publicResolverAddress = (process.env.NEXDOMAINS_PUBLIC_RESOLVER_ADDRESS || "0x0a8C0f71C3Ec3FC8cB59F27885eb52C033780b6f") as `0x${string}`;

type NexDomainsPrice = {
  name: string;
  available: boolean;
  priceWei?: string;
  priceUsd?: string;
  priceUsdFormatted?: string;
  priceEthFormatted?: string;
  isAgentName?: boolean;
};

type NexDomainsRegistration = {
  success: boolean;
  name: string;
  fullName: string;
  transaction: {
    to: string;
    data: `0x${string}`;
    value: string;
    chainId: number;
  };
  price: {
    wei: string;
    eth: string;
    usd: number;
  };
  referral?: {
    code: string;
    active: boolean;
    referrer?: string;
    message?: string;
  };
  instructions: string;
};

type ReferralData = {
  referrer: `0x${string}`;
  registrant: `0x${string}`;
  nameHash: `0x${string}`;
  referrerCodeHash: `0x${string}`;
  deadline: bigint;
  nonce: `0x${string}`;
};

type ReferralPayload = {
  code: string;
  active: boolean;
  referralData: ReferralData;
  signature: `0x${string}`;
  message?: string;
};

const resolverAbi = [
  {
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "addr", type: "address" }
    ],
    name: "setAddr",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" }
    ],
    name: "setText",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

const controllerAbi = [
  {
    inputs: [
      {
        components: [
          { name: "name", type: "string" },
          { name: "owner", type: "address" },
          { name: "secret", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "data", type: "bytes[]" },
          { name: "reverseRecord", type: "bool" },
          { name: "ownerControlledFuses", type: "uint16" },
          { name: "deployWallet", type: "bool" },
          { name: "walletSalt", type: "uint256" }
        ],
        name: "req",
        type: "tuple"
      },
      {
        components: [
          { name: "referrer", type: "address" },
          { name: "registrant", type: "address" },
          { name: "nameHash", type: "bytes32" },
          { name: "referrerCodeHash", type: "bytes32" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "bytes32" }
        ],
        name: "referralData",
        type: "tuple"
      },
      { name: "referralSignature", type: "bytes" }
    ],
    name: "register",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  }
] as const;

function baseUrl() {
  if (!nexDomainsBaseUrl) return null;
  return nexDomainsBaseUrl.replace(/\/$/, "");
}

export function hasNexDomainsApi() {
  return Boolean(baseUrl());
}

function emptyReferralPayload(code: string, message?: string): ReferralPayload {
  return {
    code,
    active: false,
    referralData: {
      referrer: zeroAddress,
      registrant: zeroAddress,
      nameHash: zeroHash,
      referrerCodeHash: zeroHash,
      deadline: BigInt(0),
      nonce: zeroHash
    },
    signature: "0x",
    message
  };
}

function buildResolverData(input: { name: string; owner: string; textRecords?: Record<string, string> }) {
  const node = namehash(`${input.name}.id`);
  const data: `0x${string}`[] = [
    encodeFunctionData({
      abi: resolverAbi,
      functionName: "setAddr",
      args: [node, input.owner as `0x${string}`]
    })
  ];

  for (const [key, value] of Object.entries(input.textRecords ?? {})) {
    if (!key || !value) continue;
    data.push(encodeFunctionData({
      abi: resolverAbi,
      functionName: "setText",
      args: [node, key, value]
    }));
  }

  return data;
}

async function getNexDomainsReferralPayload(input: {
  referralCode?: string | null;
  registrantAddress: string;
  name: string;
}): Promise<ReferralPayload | null> {
  const root = baseUrl();
  const code = cleanReferralCode(input.referralCode);
  if (!root || !code) return null;

  try {
    const response = await fetch(`${root}/api/referral/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referralCode: code,
        registrantAddress: input.registrantAddress,
        name: input.name
      })
    });
    const body = await response.json().catch(() => null) as {
      success?: boolean;
      error?: string;
      referralData?: {
        referrer?: string;
        registrant?: string;
        nameHash?: string;
        referrerCodeHash?: string;
        deadline?: string | number;
        nonce?: string;
      };
      signature?: string;
    } | null;

    if (!response.ok || !body?.success || !body.referralData || !body.signature || body.signature === "0x") {
      return emptyReferralPayload(code, body?.error || "Referral was not accepted by NexDomains");
    }

    const referralData: ReferralData = {
      referrer: (body.referralData.referrer || zeroAddress) as `0x${string}`,
      registrant: (body.referralData.registrant || input.registrantAddress) as `0x${string}`,
      nameHash: (body.referralData.nameHash || zeroHash) as `0x${string}`,
      referrerCodeHash: (body.referralData.referrerCodeHash || zeroHash) as `0x${string}`,
      deadline: BigInt(body.referralData.deadline || 0),
      nonce: (body.referralData.nonce || zeroHash) as `0x${string}`
    };

    return {
      code,
      active: referralData.referrer !== zeroAddress,
      referralData,
      signature: body.signature as `0x${string}`
    };
  } catch (error) {
    return emptyReferralPayload(code, error instanceof Error ? error.message : "Referral lookup failed");
  }
}

function withReferralTransaction(input: {
  registration: NexDomainsRegistration;
  owner: string;
  name: string;
  textRecords: Record<string, string>;
  referral: ReferralPayload;
}) {
  if (!input.referral.active) {
    return {
      ...input.registration,
      referral: {
        code: input.referral.code,
        active: false,
        message: input.referral.message
      }
    };
  }

  const registerRequest = {
    name: input.name,
    owner: input.owner as `0x${string}`,
    secret: zeroHash,
    resolver: publicResolverAddress,
    data: buildResolverData({ name: input.name, owner: input.owner, textRecords: input.textRecords }),
    reverseRecord: true,
    ownerControlledFuses: 0,
    deployWallet: false,
    walletSalt: BigInt(0)
  };

  const data = encodeFunctionData({
    abi: controllerAbi,
    functionName: "register",
    args: [registerRequest, input.referral.referralData, input.referral.signature]
  });

  return {
    ...input.registration,
    transaction: {
      ...input.registration.transaction,
      to: input.registration.transaction.to || controllerAddress,
      data,
      chainId: input.registration.transaction.chainId || chainId
    },
    referral: {
      code: input.referral.code,
      active: true,
      referrer: input.referral.referralData.referrer
    },
    instructions: `${input.registration.instructions} Referral attribution is included through NexDomains.`
  };
}

export async function getNexDomainsPrice(name: string): Promise<NexDomainsPrice | null> {
  const root = baseUrl();
  if (!root) return null;
  const response = await fetch(`${root}/api/price?name=${encodeURIComponent(name)}`, {
    cache: "no-store"
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404 || response.status === 409) return null;
    throw new Error(body?.error || body?.details || `NexDomains price API failed: ${response.status}`);
  }
  return body as NexDomainsPrice;
}

export async function buildNexDomainsRegistration(input: {
  name: string;
  owner: string;
  referralCode?: string | null;
  textRecords?: Record<string, string>;
}): Promise<NexDomainsRegistration | null> {
  const root = baseUrl();
  if (!root) return null;
  const textRecords = input.textRecords ?? {
    "com.nexid.product": "EdgeBoard",
    "com.nexid.profile": buildAppUrl(input.name)
  };
  const response = await fetch(`${root}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      owner: input.owner,
      reverseRecord: true,
      referralCode: cleanReferralCode(input.referralCode) ?? undefined,
      textRecords
    })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || body?.details || `NexDomains register API failed: ${response.status}`);
  }
  const registration = body as NexDomainsRegistration;
  const referral = await getNexDomainsReferralPayload({
    referralCode: input.referralCode,
    registrantAddress: input.owner,
    name: input.name
  });
  return referral ? withReferralTransaction({ registration, owner: input.owner, name: input.name, textRecords, referral }) : registration;
}

export async function confirmNexDomainsTransaction(txHash: string) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new Error("Invalid transaction hash");
  }
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org")
  });
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash as Hash,
    confirmations: 1,
    timeout: 120_000
  });
  if (receipt.status !== "success") {
    throw new Error("NexDomains registration transaction failed");
  }
  return {
    txHash,
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status
  };
}
