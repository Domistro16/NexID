import type { Metadata } from "next";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "ProofFlow Genesis Settlement Network | NexMarkets",
  description:
    "ProofFlow is the NexMarkets settlement network: locked Resolution Cards, public evidence, Genesis Provers, NexMind audits, and settlement receipts.",
  path: "/proofflow"
});

export default function ProofFlowLayout({ children }: { children: React.ReactNode }) {
  return children;
}
