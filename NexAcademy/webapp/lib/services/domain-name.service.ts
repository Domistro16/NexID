import { ethers } from "ethers";
import { getConstants } from "@/constant";
import { config } from "@/lib/config";

const REVERSE_REGISTRAR_ABI = [
  "function node(address addr) view returns (bytes32)",
];

const ENS_REGISTRY_ABI = [
  "function resolver(bytes32 node) view returns (address)",
];

const NAME_RESOLVER_ABI = [
  "function name(bytes32 node) view returns (string)",
];

function normalizeWalletAddress(walletAddress: string) {
  return walletAddress.trim().toLowerCase();
}

async function resolvePrimaryNameForWallet(
  provider: ethers.JsonRpcProvider,
  reverseRegistrar: ethers.Contract,
  registry: ethers.Contract,
  walletAddress: string,
): Promise<string | null> {
  try {
    const node = await reverseRegistrar.node(walletAddress);
    const resolverAddress = await registry.resolver(node);

    if (!resolverAddress || resolverAddress === ethers.ZeroAddress) {
      return null;
    }

    const resolver = new ethers.Contract(
      resolverAddress,
      NAME_RESOLVER_ABI,
      provider,
    );
    const resolvedName = await resolver.name(node);

    if (typeof resolvedName === "string" && resolvedName.toLowerCase().endsWith(".id")) {
      return resolvedName;
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolvePrimaryNamesByWallet(
  walletAddresses: string[],
): Promise<Map<string, string>> {
  const uniqueWallets = Array.from(
    new Set(
      walletAddresses
        .filter((walletAddress): walletAddress is string => typeof walletAddress === "string")
        .map((walletAddress) => normalizeWalletAddress(walletAddress))
        .filter((walletAddress) => walletAddress.startsWith("0x") && walletAddress.length === 42),
    ),
  );

  if (uniqueWallets.length === 0) {
    return new Map();
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const constants = getConstants(config.chainId);
  const reverseRegistrar = new ethers.Contract(
    constants.ReverseRegistrar,
    REVERSE_REGISTRAR_ABI,
    provider,
  );
  const registry = new ethers.Contract(
    constants.Registry,
    ENS_REGISTRY_ABI,
    provider,
  );

  const resolvedEntries = await Promise.all(
    uniqueWallets.map(async (walletAddress) => {
      const resolvedName = await resolvePrimaryNameForWallet(
        provider,
        reverseRegistrar,
        registry,
        walletAddress,
      );
      return [walletAddress, resolvedName] as const;
    }),
  );

  return new Map(
    resolvedEntries.filter(
      (entry): entry is readonly [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
    ),
  );
}
