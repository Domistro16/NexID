import type { Metadata } from "next";
import { normalizeAppBaseUrl } from "@/lib/appBaseUrl";

export const SITE_NAME = "NexMarkets";
export const SITE_URL = normalizeAppBaseUrl(process.env.NEXT_PUBLIC_APP_BASE_URL ?? process.env.APP_BASE_URL);
export const DEFAULT_TITLE = "Launch a market for any narrative, earn 1% of all trades automatically, settled by randomly selected credentialed human";
export const DEFAULT_DESCRIPTION =
  "Launch, trade, and settle native prediction markets with locked Resolution Cards, ProofFlow consensus, Prover review, creator fees, and public receipts.";
export const DEFAULT_OG_IMAGE = "/og/nexmarkets-og.png";

type SeoMetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: string;
  noIndex?: boolean;
};

export function absoluteUrl(path = "/") {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${cleanPath}`;
}

export function pageSeo({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  noIndex = false
}: SeoMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} market launch and settlement network`
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image]
    },
    robots: noIndex ? noIndexRobots() : indexRobots()
  };
}

export function indexRobots(): Metadata["robots"] {
  return {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1
    }
  };
}

export function noIndexRobots(): Metadata["robots"] {
  return {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false
    }
  };
}
