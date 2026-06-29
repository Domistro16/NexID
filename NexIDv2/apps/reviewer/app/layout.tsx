import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexMarkets ProofFlow Workbench",
  description: "Genesis Prover workbench for ProofFlow evidence review assignments."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
