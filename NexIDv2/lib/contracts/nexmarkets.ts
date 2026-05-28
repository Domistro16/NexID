import { keccak256, stringToBytes, type Address, type Hex } from "viem";
import type { ShapedMarketDraft } from "@/lib/types/nexmarkets";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_MAINNET_CHAIN_ID = 8453;
export const DEFAULT_NATIVE_MARKETS_CHAIN_ID = Number(process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || BASE_SEPOLIA_CHAIN_ID);
export const LAUNCH_STAKE_USDC = BigInt(20_000_000);
export const DEFAULT_MARKET_DURATION_SECONDS = 7 * 24 * 60 * 60;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export const marketFactoryAbi = [
  {
    type: "function",
    name: "allowedTemplates",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rulesHash", type: "bytes32" },
      { name: "metadataHash", type: "bytes32" },
      { name: "templateId", type: "bytes32" },
      { name: "closeTime", type: "uint256" },
      {
        name: "authorization",
        type: "tuple",
        components: [
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "signature", type: "bytes" }
        ]
      }
    ],
    outputs: [{ name: "market", type: "address" }]
  }
] as const;

export const nativeBinaryMarketAbi = [
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "side", type: "uint8" },
      { name: "notional", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [
      { name: "side", type: "uint8" },
      { name: "notional", type: "uint256" }
    ],
    outputs: [
      { name: "fee", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "priceBps", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "currentPriceBps",
    stateMutability: "view",
    inputs: [{ name: "side", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "status",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  }
] as const;

function configuredAddress(value: string | undefined): Address | undefined {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return undefined;
  return value as Address;
}

export function nativeMarketAddresses(chainId = DEFAULT_NATIVE_MARKETS_CHAIN_ID) {
  return {
    factory: configuredAddress(process.env.NEXT_PUBLIC_NATIVE_MARKET_FACTORY_ADDRESS),
    launchStakeVault: configuredAddress(process.env.NEXT_PUBLIC_NATIVE_LAUNCH_STAKE_VAULT_ADDRESS),
    collateral: configuredAddress(chainId === BASE_MAINNET_CHAIN_ID ? process.env.NEXT_PUBLIC_USDC_BASE_MAINNET : process.env.NEXT_PUBLIC_USDC_BASE_SEPOLIA)
  };
}

export function draftRulesHash(draft: ShapedMarketDraft): Hex {
  return keccak256(stringToBytes(JSON.stringify({
    question: draft.question,
    arena: draft.arena,
    template: draft.template,
    timeframe: draft.timeframe,
    settlementSource: draft.settlementSource,
    sourceUrl: draft.resolution.sourceUrl
  })));
}

export function draftMetadataHash(draft: ShapedMarketDraft): Hex {
  return keccak256(stringToBytes(JSON.stringify(draft)));
}

export function templateIdFor(template: string): Hex {
  return keccak256(stringToBytes(template));
}

export function defaultNativeCloseTime() {
  return BigInt(Math.floor(Date.now() / 1000) + DEFAULT_MARKET_DURATION_SECONDS);
}

export function formatUsdcUnits(value: bigint | undefined) {
  const amount = Number(value ?? BigInt(0)) / 1_000_000;
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: amount >= 100 ? 0 : 2,
    maximumFractionDigits: 2
  });
}
