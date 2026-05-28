import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "NexMarkets",
  description: "Trade live narratives, launch missing markets, keep receipts, and build a portable .id passport."
};

export default function HomePage() {
  redirect("/pulse");
}
