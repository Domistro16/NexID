import type { Metadata } from "next";
import { LaunchStudioClient } from "@/components/nexmarkets/launch/launch-studio-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export const metadata: Metadata = {
  title: "Launch | NexMarkets",
  description: "Shape a thesis, check market fit, and prepare a NexMarkets launch."
};

export default function LaunchPage() {
  return (
    <NexidAppShell>
      <LaunchStudioClient />
    </NexidAppShell>
  );
}
