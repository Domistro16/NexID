import type { Metadata, Viewport } from "next";
import { RootChrome } from "@/components/nexid/shared/root-chrome";
import { SiteStructuredData } from "@/components/seo/site-structured-data";
import { WalletProviders } from "@/components/wallet-providers";
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, DEFAULT_TITLE, SITE_NAME, SITE_URL, indexRobots } from "@/lib/seo";
import "./globals.css";
import "./template.css";
import "./nexmarkets-overhaul.css";
import "./ui-fixes.css";

const themeInitScript = `
(() => {
  const root = document.documentElement;
  try {
    const saved = window.localStorage.getItem("nexid_theme");
    const theme = saved === "dark" || saved === "light" ? saved : "light";
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  } catch {
    root.dataset.theme = "light";
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  keywords: [
    "NexMarkets",
    "prediction markets",
    "native prediction markets",
    "launch a market",
    "ProofFlow",
    "Resolution Cards",
    "creator fees",
    "Base markets",
    "agent market launch"
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "finance",
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined
  },
  robots: indexRobots(),
  icons: {
    icon: [
      {
        url: "/nexmarkets-favicon-light.png",
        media: "(prefers-color-scheme: light)",
        type: "image/png"
      },
      {
        url: "/nexmarkets-favicon-dark.png",
        media: "(prefers-color-scheme: dark)",
        type: "image/png"
      }
    ],
    shortcut: [{ url: "/nexmarkets-favicon-light.png", type: "image/png" }],
    apple: [{ url: "/nexmarkets-favicon-light.png", type: "image/png" }]
  },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "NexMarkets market launch and ProofFlow settlement network"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE]
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5efe3" },
    { media: "(prefers-color-scheme: dark)", color: "#050506" }
  ],
  colorScheme: "light dark"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <div className="grid-bg" />
        <SiteStructuredData />
        <WalletProviders>
          <RootChrome>{children}</RootChrome>
        </WalletProviders>
      </body>
    </html>
  );
}
