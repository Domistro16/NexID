"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { zeroAddress } from "viem";
import { normalizePrimaryDomainName } from "@/lib/identity";

const registryAddress = (process.env.NEXT_PUBLIC_NEXDOMAINS_REGISTRY_ADDRESS || "0xA590B208e7F2e62a3987424D2E1b00cd62986fAd") as `0x${string}`;
const reverseRegistrarAddress = (process.env.NEXT_PUBLIC_NEXDOMAINS_REVERSE_REGISTRAR_ADDRESS || "0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA") as `0x${string}`;

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

export function usePrimaryDomainName(owner?: `0x${string}`) {
  const { data: node } = useReadContract({
    address: reverseRegistrarAddress,
    abi: reverseNodeAbi,
    functionName: "node",
    args: owner ? [owner] : undefined,
    chainId: base.id,
    query: { enabled: Boolean(owner) }
  });

  const { data: resolverResponse } = useReadContract({
    address: registryAddress,
    abi: resolverAbi,
    functionName: "resolver",
    args: node ? [node] : undefined,
    chainId: base.id,
    query: { enabled: Boolean(node) }
  });

  const resolver = useMemo(() => {
    return resolverResponse && resolverResponse !== zeroAddress ? resolverResponse : undefined;
  }, [resolverResponse]);

  const { data: resolvedName } = useReadContract({
    address: resolver ?? zeroAddress,
    abi: nameAbi,
    functionName: "name",
    args: node ? [node] : undefined,
    chainId: base.id,
    query: { enabled: Boolean(resolver && node) }
  });

  return normalizePrimaryDomainName(typeof resolvedName === "string" ? resolvedName : null);
}
