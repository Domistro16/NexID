import type { Metadata } from "next";
import { ProofOpsPage } from "@/components/nexmarkets/proofops/proofops-page";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export const metadata: Metadata = {
  title: "ProofOps | NexMarkets",
  description: "Agent-assisted QA and security receipts for NexMarkets product and contract flows."
};

export default function ProofOpsRoutePage() {
  return (
    <NexidAppShell>
      <ProofOpsPage />
    </NexidAppShell>
  );
}
