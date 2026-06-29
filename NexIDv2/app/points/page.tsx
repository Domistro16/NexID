import type { Metadata } from "next";
import { PointsPageClient } from "@/components/nexid/points/points-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Points | NexMarkets",
  description: "Private NexMarkets points and reward progress.",
  robots: noIndexRobots()
};

export default function PointsPage() {
  return (
    <NexidAppShell>
      <PointsPageClient />
    </NexidAppShell>
  );
}
