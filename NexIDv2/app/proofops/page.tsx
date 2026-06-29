import type { Metadata } from "next";
import { ProofOpsPage } from "@/components/nexmarkets/proofops/proofops-page";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "ProofOps QA and Security Receipts | NexMarkets",
  description: "ProofOps records agent-assisted QA, product checks, security reports, and fix receipts for NexMarkets market and contract flows.",
  path: "/proofops"
});

export default function ProofOpsRoutePage() {
  return (
    <NexidAppShell>
      <ProofOpsPage />
    </NexidAppShell>
  );
}
