// ─────────────────────────────────────────────────────────────────────────────
// On-Chain Verification Service
//
// Multi-chain EVM transaction verification via viem.
// Users submit a tx hash → service verifies it matches the campaign's
// on-chain task (correct chain, contract, sender, amount, success).
// ─────────────────────────────────────────────────────────────────────────────

import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  type TransactionReceipt,
  type Log,
  decodeEventLog,
  formatEther,
  formatUnits,
  type Hex,
} from "viem";
import { base, mainnet, arbitrum } from "viem/chains";

// ── Chain Registry ──────────────────────────────────────────────────────────

/** Hyperliquid L1 (custom EVM chain) */
const hyperliquid: Chain = {
  id: 998,
  name: "Hyperliquid L1",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.hyperliquid.xyz"] },
  },
  blockExplorers: {
    default: { name: "Hyperliquid Explorer", url: "https://explorer.hyperliquid.xyz" },
  },
};

/** MegaETH Testnet */
const megaethTestnet: Chain = {
  id: 6342,
  name: "MegaETH Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://carrot.megaeth.com/rpc"] },
  },
  blockExplorers: {
    default: { name: "MegaETH Explorer", url: "https://www.megaexplorer.xyz" },
  },
};

/** Known chain definitions keyed by our chain identifiers */
const CHAIN_MAP: Record<string, Chain> = {
  base,
  ethereum: mainnet,
  arbitrum,
  hyperliquid,
};

/** Default public RPCs (fallbacks — campaigns can override via onchainConfig.rpcEndpoint) */
const DEFAULT_RPCS: Record<string, string> = {
  base: "https://mainnet.base.org",
  ethereum: "https://eth.llamarpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  hyperliquid: "https://rpc.hyperliquid.xyz",
};

// ── ERC-20 Transfer event ABI for log decoding ─────────────────────────────

const ERC20_TRANSFER_ABI = [
  {
    type: "event" as const,
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

// ── Types ───────────────────────────────────────────────────────────────────

export interface OnchainConfig {
  actionDescription?: string;
  contractAddress?: string;
  minAmountUsd?: number;
  verificationMethod?: "transfer" | "interaction" | "custom";
  rpcEndpoint?: string;
  chainId?: number;
}

export interface VerificationResult {
  verified: boolean;
  reason?: string;
  txHash: string;
  chain: string;
  from: string;
  to: string | null;
  value: string;
  amountRatio?: number;
  blockNumber: bigint;
  rawData: Record<string, unknown>;
}

// ── Public Client Factory ───────────────────────────────────────────────────

function getPublicClient(chainKey: string, config?: OnchainConfig): PublicClient {
  const knownChain = CHAIN_MAP[chainKey];

  if (knownChain) {
    const rpcUrl = config?.rpcEndpoint || DEFAULT_RPCS[chainKey] || knownChain.rpcUrls.default.http[0];
    return createPublicClient({
      chain: knownChain,
      transport: http(rpcUrl),
    });
  }

  // "other" — custom chain using campaign's config
  if (!config?.rpcEndpoint) {
    throw new VerificationError("MISSING_RPC", "Custom chain requires an RPC endpoint in campaign config");
  }

  const customChain: Chain = {
    id: config.chainId ?? 1,
    name: "Custom EVM Chain",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [config.rpcEndpoint] },
    },
  };

  return createPublicClient({
    chain: customChain,
    transport: http(config.rpcEndpoint),
  });
}

// ── Error class ─────────────────────────────────────────────────────────────

export class VerificationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "VerificationError";
  }
}

// ── Core Verification ───────────────────────────────────────────────────────

/**
 * Verify an on-chain transaction matches a campaign's required action.
 *
 * Checks:
 * 1. Transaction exists and succeeded (not reverted)
 * 2. tx.from matches the user's wallet
 * 3. tx.to matches the campaign's contract address (if configured)
 * 4. Value/amount meets minimum (if configured)
 */
export async function verifyOnchainAction(
  txHash: string,
  chainKey: string,
  onchainConfig: OnchainConfig | null,
  userWallet: string,
): Promise<VerificationResult> {
  const config = onchainConfig ?? {};
  const client = getPublicClient(chainKey, config);

  // Fetch transaction and receipt
  let tx;
  let receipt: TransactionReceipt;

  try {
    [tx, receipt] = await Promise.all([
      client.getTransaction({ hash: txHash as Hex }),
      client.getTransactionReceipt({ hash: txHash as Hex }),
    ]);
  } catch (err) {
    throw new VerificationError(
      "TX_NOT_FOUND",
      `Transaction ${txHash} not found on ${chainKey}. Ensure the correct chain is selected.`,
    );
  }

  // 1. Check tx success
  if (receipt.status !== "success") {
    return buildResult(false, "Transaction reverted (failed)", tx, receipt, chainKey, config);
  }

  // 2. Check sender matches user wallet
  if (tx.from.toLowerCase() !== userWallet.toLowerCase()) {
    return buildResult(
      false,
      `Sender mismatch: tx from ${tx.from}, expected ${userWallet}`,
      tx,
      receipt,
      chainKey,
      config,
    );
  }

  // 3. Check contract address (if configured)
  if (config.contractAddress) {
    const targetAddr = config.contractAddress.toLowerCase();
    const txTo = tx.to?.toLowerCase() ?? "";

    // Check direct tx.to OR look for interactions in logs
    if (txTo !== targetAddr) {
      // Check if any log was emitted by the target contract (indirect interaction)
      const interactedViaLogs = receipt.logs.some(
        (log) => log.address.toLowerCase() === targetAddr,
      );
      if (!interactedViaLogs) {
        return buildResult(
          false,
          `Contract mismatch: tx interacts with ${tx.to}, expected ${config.contractAddress}`,
          tx,
          receipt,
          chainKey,
          config,
        );
      }
    }
  }

  // 4. Check amount (if configured)
  let amountRatio: number | undefined;

  if (config.minAmountUsd && config.minAmountUsd > 0) {
    const { totalValue, method } = extractTransactionValue(tx, receipt, config);

    if (totalValue <= 0) {
      return buildResult(
        false,
        "Could not detect a value transfer in this transaction",
        tx,
        receipt,
        chainKey,
        config,
      );
    }

    // NOTE: For a production system, you'd fetch real-time price feeds here.
    // For now, we use the raw token amount as a proxy (campaigns should configure
    // minAmountUsd in the token's native denomination for non-USD stablecoins).
    amountRatio = totalValue / config.minAmountUsd;

    if (amountRatio < 1.0) {
      return buildResult(
        false,
        `Amount too low: ${totalValue.toFixed(6)} (minimum: ${config.minAmountUsd})`,
        tx,
        receipt,
        chainKey,
        config,
        amountRatio,
      );
    }
  }

  return buildResult(true, undefined, tx, receipt, chainKey, config, amountRatio);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractTransactionValue(
  tx: { value: bigint; to: string | null },
  receipt: TransactionReceipt,
  config: OnchainConfig,
): { totalValue: number; method: string } {
  // Try native value first
  const nativeValue = Number(formatEther(tx.value));
  if (nativeValue > 0) {
    return { totalValue: nativeValue, method: "native" };
  }

  // Try ERC-20 Transfer logs
  const targetContract = config.contractAddress?.toLowerCase();
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ERC20_TRANSFER_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });

      if (decoded.eventName === "Transfer") {
        const args = decoded.args as { from: string; to: string; value: bigint };
        // If we have a target contract, only count transfers TO it
        if (targetContract && args.to.toLowerCase() !== targetContract) continue;

        // Assume 6 decimals for stablecoins (USDC/USDT), 18 for others
        const isStablecoin = log.address.toLowerCase() !== tx.to?.toLowerCase();
        const decimals = isStablecoin ? 6 : 18;
        const value = Number(formatUnits(args.value, decimals));

        if (value > 0) {
          return { totalValue: value, method: "erc20" };
        }
      }
    } catch {
      // Not a Transfer event — skip
    }
  }

  return { totalValue: 0, method: "none" };
}

function buildResult(
  verified: boolean,
  reason: string | undefined,
  tx: { from: string; to: string | null; value: bigint; hash: string; blockNumber: bigint },
  receipt: TransactionReceipt,
  chain: string,
  config: OnchainConfig,
  amountRatio?: number,
): VerificationResult {
  return {
    verified,
    reason,
    txHash: tx.hash,
    chain,
    from: tx.from,
    to: tx.to,
    value: formatEther(tx.value),
    amountRatio,
    blockNumber: tx.blockNumber,
    rawData: {
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: tx.blockNumber.toString(),
      logsCount: receipt.logs.length,
      contractAddress: config.contractAddress ?? null,
      verificationMethod: config.verificationMethod ?? "transfer",
    },
  };
}

// ── Supported Chains List (for frontend) ────────────────────────────────────

export const SUPPORTED_CHAINS = [
  { key: "base", label: "Base", chainId: 8453 },
  { key: "ethereum", label: "Ethereum Mainnet", chainId: 1 },
  { key: "arbitrum", label: "Arbitrum One", chainId: 42161 },
  { key: "hyperliquid", label: "Hyperliquid L1", chainId: 998 },
  { key: "other", label: "Other (Custom EVM)", chainId: null },
] as const;
