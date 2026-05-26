import type { Metadata } from "next";
import { WalletProviders } from "@/components/wallet-providers";
import "./globals.css";
import "./template.css";
import "./ui-fixes.css";

export const metadata: Metadata = {
  title: "NexID EdgeBoard",
  description:
    "Ride or fade live CT narratives, generate receipts, climb EdgeBoards, and build a portable .id edge profile."
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
