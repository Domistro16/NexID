import type { Metadata } from "next";
import { WalletProviders } from "@/components/wallet-providers";
import "./globals.css";
import "./template.css";
import "./nexmarkets-overhaul.css";
import "./ui-fixes.css";

export const metadata: Metadata = {
  title: "NexMarkets",
  description:
    "Trade live narratives, launch missing markets, keep receipts, and build a portable .id passport."
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
