import { createPublicClient, http, isAddress, zeroAddress, zeroHash } from "viem";
import { base } from "viem/chains";
import { normalizePrimaryDomainName } from "@/lib/identity";

const registryAddress = (process.env.NEXDOMAINS_REGISTRY_ADDRESS || "0xA590B208e7F2e62a3987424D2E1b00cd62986fAd") as `0x${string}`;
const reverseRegistrarAddress = (process.env.NEXDOMAINS_REVERSE_REGISTRAR_ADDRESS || "0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA") as `0x${string}`;

const reverseNodeAbi = [
  {
    inputs: [{ internalType: "address", name: "addr", type: "address" }],
    name: "node",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "pure",
    type: "function"
  }
] as const;

const resolverAbi = [
  {
    inputs: [{ internalType: "bytes32", name: "node", type: "bytes32" }],
    name: "resolver",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

const nameAbi = [
  {
    inputs: [{ internalType: "bytes32", name: "node", type: "bytes32" }],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org")
});

export async function resolveNexDomainsPrimaryName(walletAddress: string) {
  if (!isAddress(walletAddress)) return null;

  try {
    const node = await publicClient.readContract({
      address: reverseRegistrarAddress,
      abi: reverseNodeAbi,
      functionName: "node",
      args: [walletAddress as `0x${string}`]
    });
    if (!node || node === zeroHash) return null;

    const resolver = await publicClient.readContract({
      address: registryAddress,
      abi: resolverAbi,
      functionName: "resolver",
      args: [node]
    });
    if (!resolver || resolver === zeroAddress) return null;

    const name = await publicClient.readContract({
      address: resolver,
      abi: nameAbi,
      functionName: "name",
      args: [node]
    });

    return normalizePrimaryDomainName(name);
  } catch {
    return null;
  }
}
