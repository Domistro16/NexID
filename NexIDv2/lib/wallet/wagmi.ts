"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, polygon, polygonAmoy } from "wagmi/chains";

export const supportedChains = [base, polygon, polygonAmoy] as const;

export const wagmiConfig = getDefaultConfig({
  appName: "NexID EdgeBoard",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "nexid-edgeboard-dev",
  chains: supportedChains,
  ssr: true
});
