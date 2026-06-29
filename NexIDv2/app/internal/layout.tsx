import type { Metadata } from "next";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Internal | NexMarkets",
  description: "NexMarkets internal operations.",
  robots: noIndexRobots()
};

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
