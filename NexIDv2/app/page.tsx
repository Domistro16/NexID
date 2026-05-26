import type { Metadata } from "next";
import { HomePageClient } from "@/components/nexid/home/home-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export const metadata: Metadata = {
  title: "NexID EdgeBoard",
  description: "Ride or fade live CT narratives, generate receipts, climb EdgeBoards, and build a portable .id edge profile."
};

export default function HomePage() {
  return (
    <NexidAppShell>
      <HomePageClient />
    </NexidAppShell>
  );
}
