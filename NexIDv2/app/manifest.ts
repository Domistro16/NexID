import type { MetadataRoute } from "next";
import { DEFAULT_DESCRIPTION, SITE_NAME } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NexMarkets - Native Prediction Markets",
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050506",
    theme_color: "#050506",
    icons: [
      {
        src: "/nexmarkets-favicon-light.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/nexmarkets-logo-light.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
