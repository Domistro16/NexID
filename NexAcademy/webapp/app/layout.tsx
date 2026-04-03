import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { validateConfig } from "@/lib/config";

// Validate required env vars at startup
if (process.env.NODE_ENV === 'production') {
  validateConfig();
}

export const metadata: Metadata = {
  title: "Nexid - Where your attention gets rewarded",
  description: "AI-Powered development, blockchain, and cryptocurrency with Nex Academy",
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
