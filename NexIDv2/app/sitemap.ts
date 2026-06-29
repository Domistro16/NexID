import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { listNexMarkets } from "@/lib/services/nexmarketsService";
import type { NexMarket } from "@/lib/types/nexmarkets";

const staticRoutes = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/markets", priority: 0.95, changeFrequency: "hourly" },
  { path: "/launch", priority: 0.9, changeFrequency: "weekly" },
  { path: "/agents", priority: 0.78, changeFrequency: "weekly" },
  { path: "/proofflow", priority: 0.86, changeFrequency: "weekly" },
  { path: "/proofops", priority: 0.62, changeFrequency: "weekly" },
  { path: "/edgeboard", priority: 0.72, changeFrequency: "daily" },
  { path: "/mint", priority: 0.68, changeFrequency: "weekly" },
  { path: "/pulse", priority: 0.7, changeFrequency: "hourly" },
  { path: "/legal/terms", priority: 0.42, changeFrequency: "monthly" },
  { path: "/legal/privacy", priority: 0.42, changeFrequency: "monthly" },
  { path: "/legal/docs", priority: 0.5, changeFrequency: "monthly" },
  { path: "/legal/how", priority: 0.48, changeFrequency: "monthly" },
  { path: "/legal/faq", priority: 0.46, changeFrequency: "monthly" },
  { path: "/legal/risk", priority: 0.42, changeFrequency: "monthly" }
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries = staticRoutes.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority
  }));

  const markets: NexMarket[] = await listNexMarkets().catch(() => [] as NexMarket[]);
  const marketEntries = markets
    .filter((market) => !["draft", "route_check", "cancelled_before_trading"].includes(market.status))
    .map((market) => ({
      url: absoluteUrl(`/market/${encodeURIComponent(market.id)}`),
      lastModified: market.updatedAt ? new Date(market.updatedAt) : now,
      changeFrequency: "hourly" as const,
      priority: market.origin === "native" ? 0.86 : 0.74
    }));

  return [...staticEntries, ...marketEntries];
}
