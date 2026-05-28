"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia, polygon, polygonAmoy } from "wagmi/chains";

export const supportedChains = [base, baseSepolia, polygon, polygonAmoy] as const;

export const wagmiConfig = getDefaultConfig({
  appName: "NexMarkets",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "nexid-edgeboard-dev",
  chains: supportedChains,
  ssr: true
});
