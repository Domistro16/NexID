import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  parseAbi,
  type Address
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { DEFAULT_NEXMARKETS_CHAIN_ID, nexMarketsContracts } from "@/config/nexmarkets-contracts";

const sponsoredFactoryAdminAbi = parseAbi([
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function sponsoredLaunchAllowance(address creator) view returns (uint256)",
  "function sponsoredLaunchUsed(address creator) view returns (uint256)"
]);

const maxBatchSize = 50;

type SponsoredLauncherRow = {
  wallet: Address;
  allowance: number;
  used: number;
  remaining: number;
};

type SponsoredLauncherAdminSummary = {
  chainId: number;
  network: string;
  factoryAddress: Address;
  rpcConfigured: boolean;
  adminAddress: Address | null;
  adminHasRole: boolean | null;
};

function requestedChainId(chainId?: number) {
  return chainId || Number(process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || DEFAULT_NEXMARKETS_CHAIN_ID);
}

function chainConfig(chainId: number) {
  if (chainId === 8453) return { chain: base, rpcUrl: process.env.BASE_RPC_URL };
  if (chainId === 84532) return { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL };
  throw new Error(`Unsupported sponsored launcher chain: ${chainId}.`);
}

function sponsoredFactoryAddress(chainId: number) {
  const configured = nexMarketsContracts(chainId)?.sponsoredMarketFactory;
  if (!configured || !isAddress(configured)) {
    throw new Error(`Sponsored market factory is not configured for chain ${chainId}.`);
  }
  return getAddress(configured) as Address;
}

function clients(chainId: number) {
  const config = chainConfig(chainId);
  if (!config.rpcUrl) throw new Error(`RPC URL is required for chain ${chainId}.`);
  const transport = http(config.rpcUrl, { retryCount: 2, retryDelay: 1000, timeout: 20000 });
  return {
    chain: config.chain,
    publicClient: createPublicClient({ chain: config.chain, transport })
  };
}

export function parseSponsoredLauncherWallets(input: string | string[]) {
  const parts = (Array.isArray(input) ? input : [input])
    .flatMap((value) => value.split(/[\s,;]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("Enter at least one sponsored launcher wallet.");
  if (parts.length > maxBatchSize) throw new Error(`Sponsored launcher batches are limited to ${maxBatchSize} wallets at a time.`);

  const seen = new Set<string>();
  const wallets: Address[] = [];
  for (const part of parts) {
    if (!isAddress(part)) throw new Error(`Invalid wallet address: ${part}`);
    const wallet = getAddress(part) as Address;
    const key = wallet.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      wallets.push(wallet);
    }
  }
  return wallets;
}

async function readRows(chainId: number, wallets: Address[]) {
  const { publicClient } = clients(chainId);
  const factoryAddress = sponsoredFactoryAddress(chainId);
  const rows = await Promise.all(wallets.map(async (wallet) => {
    const [allowance, used] = await Promise.all([
      publicClient.readContract({
        address: factoryAddress,
        abi: sponsoredFactoryAdminAbi,
        functionName: "sponsoredLaunchAllowance",
        args: [wallet]
      }),
      publicClient.readContract({
        address: factoryAddress,
        abi: sponsoredFactoryAdminAbi,
        functionName: "sponsoredLaunchUsed",
        args: [wallet]
      })
    ]);
    const allowanceNumber = Number(allowance);
    const usedNumber = Number(used);
    return {
      wallet,
      allowance: allowanceNumber,
      used: usedNumber,
      remaining: Math.max(allowanceNumber - usedNumber, 0)
    } satisfies SponsoredLauncherRow;
  }));
  return rows;
}

function normalizedOptionalAddress(value?: string | null) {
  if (!value?.trim()) return null;
  if (!isAddress(value)) throw new Error(`Invalid admin wallet address: ${value}`);
  return getAddress(value) as Address;
}

export async function getSponsoredLauncherAdminSummary(input: { chainId?: number; adminAddress?: string | null } = {}): Promise<SponsoredLauncherAdminSummary> {
  const chainId = requestedChainId(input.chainId);
  const factoryAddress = sponsoredFactoryAddress(chainId);
  const config = chainConfig(chainId);
  const adminAddress = normalizedOptionalAddress(input.adminAddress);
  let adminHasRole: boolean | null = null;
  if (config.rpcUrl && adminAddress) {
    const { publicClient } = clients(chainId);
    const role = await publicClient.readContract({
      address: factoryAddress,
      abi: sponsoredFactoryAdminAbi,
      functionName: "DEFAULT_ADMIN_ROLE"
    });
    adminHasRole = await publicClient.readContract({
      address: factoryAddress,
      abi: sponsoredFactoryAdminAbi,
      functionName: "hasRole",
      args: [role, adminAddress]
    });
  }
  return {
    chainId,
    network: config.chain.name,
    factoryAddress,
    rpcConfigured: Boolean(config.rpcUrl),
    adminAddress,
    adminHasRole
  };
}

export async function getSponsoredLauncherAllowancesAdmin(input: {
  chainId?: number;
  wallets: string | string[];
  adminAddress?: string | null;
}) {
  const chainId = requestedChainId(input.chainId);
  const wallets = parseSponsoredLauncherWallets(input.wallets);
  const summary = await getSponsoredLauncherAdminSummary({ chainId, adminAddress: input.adminAddress });
  const rows = await readRows(chainId, wallets);
  return { ...summary, rows };
}
