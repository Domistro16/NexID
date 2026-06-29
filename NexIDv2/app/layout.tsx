import type { Metadata } from "next";
import { WalletProviders } from "@/components/wallet-providers";
import "./globals.css";
import "./template.css";
import "./nexmarkets-overhaul.css";
import "./ui-fixes.css";

export const metadata: Metadata = {
  title: "Launch a market for any narrative, earn 1% of all trades automatically, settled by randomly selected credentialed human",
  description:
    "Launch, trade, and settle native prediction markets with locked Resolution Cards, ProofFlow consensus, and public receipts.",
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
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="grid-bg" />
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}
