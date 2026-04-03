import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { validateConfig } from "@/lib/config";
import { absoluteUrl, getSiteUrl } from "@/lib/seo";

// Validate required env vars at startup
if (process.env.NODE_ENV === 'production') {
  validateConfig();
}

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NexID | Verified campaigns, AI assessments, and on-chain reputation",
    template: "%s | NexID",
  },
  description:
    "NexID turns campaigns into verifiable learning flows with AI assessment, on-chain checks, and portable reputation.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "NexID",
    title: "NexID | Verified campaigns, AI assessments, and on-chain reputation",
    description:
      "Verifiable campaign learning, structured assessments, and on-chain reputation for serious builders and protocols.",
    images: [
      {
        url: absoluteUrl("/nexid_logo.png"),
        alt: "NexID",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NexID | Verified campaigns, AI assessments, and on-chain reputation",
    description:
      "Verifiable campaign learning, structured assessments, and on-chain reputation for serious builders and protocols.",
    images: [absoluteUrl("/nexid_logo.png")],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/nexid_logo.png",
    shortcut: "/nexid_logo.png",
    apple: "/nexid_logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
