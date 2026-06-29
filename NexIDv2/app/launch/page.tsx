import type { Metadata } from "next";
import { LaunchStudioClient } from "@/components/nexmarkets/launch/launch-studio-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { pageSeo } from "@/lib/seo";

export const metadata: Metadata = pageSeo({
  title: "Launch a Prediction Market | NexMarkets",
  description: "Turn any measurable narrative into a native NexMarkets market with source checks, locked Resolution Cards, creator fees, and ProofFlow settlement.",
  path: "/launch"
});

export default function LaunchPage() {
  return (
    <NexidAppShell>
      <LaunchStudioClient />
    </NexidAppShell>
  );
}
