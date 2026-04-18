/**
 * Client-side chain switching for campaign-specific chains (e.g. MegaETH
 * Testnet). Used by the campaign detail page to pre-switch the wallet so the
 * user can execute onchain transactions without hitting a wrong-network error
 * mid-flow, and by OnchainVerificationCard to keep its UX consistent.
 */

export type CampaignChainMeta = {
  chainId: number;
  chainName: string;
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
};

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export const CAMPAIGN_CHAIN_REGISTRY: Record<string, CampaignChainMeta> = {
  base: {
    chainId: 8453,
    chainName: "Base",
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
  ethereum: {
    chainId: 1,
    chainName: "Ethereum",
    rpcUrls: ["https://cloudflare-eth.com"],
    blockExplorerUrls: ["https://etherscan.io"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
  arbitrum: {
    chainId: 42161,
    chainName: "Arbitrum One",
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://arbiscan.io"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
  hyperliquid: {
    chainId: 998,
    chainName: "Hyperliquid L1",
    rpcUrls: ["https://rpc.hyperliquid.xyz"],
    blockExplorerUrls: ["https://explorer.hyperliquid.xyz"],
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  },
  megaeth: {
    chainId: 6342,
    chainName: "MegaETH Testnet",
    rpcUrls: ["https://carrot.megaeth.com/rpc"],
    blockExplorerUrls: ["https://www.megaexplorer.xyz"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
};

export function resolveCampaignChainMeta(
  primaryChain: string | null | undefined,
  chainIdOverride: number | null | undefined,
): CampaignChainMeta | null {
  const byKey = primaryChain ? CAMPAIGN_CHAIN_REGISTRY[primaryChain] : undefined;
  if (chainIdOverride && byKey && byKey.chainId === chainIdOverride) return byKey;
  if (chainIdOverride) {
    const match = Object.values(CAMPAIGN_CHAIN_REGISTRY).find(
      (c) => c.chainId === chainIdOverride,
    );
    if (match) return match;
  }
  return byKey ?? null;
}

function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

/**
 * Try to switch the wallet to `meta`'s chain, adding it first if the wallet
 * doesn't know it yet. Throws on any wallet error (including user rejection);
 * callers decide whether to surface or swallow.
 */
export async function switchWalletChain(
  eth: EthereumProvider,
  meta: CampaignChainMeta,
): Promise<void> {
  const hexId = toHexChainId(meta.chainId);
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (err) {
    const errorCode = (err as { code?: number })?.code;
    // 4902 = chain not added. -32603 = internal error, some wallets return
    // this when the chain is unknown.
    if (errorCode === 4902 || errorCode === -32603) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: meta.chainName,
            rpcUrls: meta.rpcUrls,
            blockExplorerUrls: meta.blockExplorerUrls,
            nativeCurrency: meta.nativeCurrency,
          },
        ],
      });
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
      return;
    }
    throw err;
  }
}

/**
 * Best-effort chain switch for a campaign: reads the wallet's current chain,
 * and only prompts a switch if it differs from the campaign's target chain.
 * Swallows all errors except explicit user rejection (4001). Returns `true`
 * if the wallet ends up on the target chain afterwards.
 */
export async function ensureCampaignChain(
  meta: CampaignChainMeta,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!eth) return false;

  try {
    const current = (await eth.request({ method: "eth_chainId" })) as string;
    if (current && parseInt(current, 16) === meta.chainId) return true;
  } catch {
    // ignore — fall through and try to switch
  }

  try {
    await switchWalletChain(eth, meta);
    return true;
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4001) {
      // User rejected — respect that, don't keep nagging.
      return false;
    }
    console.warn("ensureCampaignChain: non-fatal switch failure", err);
    return false;
  }
}
