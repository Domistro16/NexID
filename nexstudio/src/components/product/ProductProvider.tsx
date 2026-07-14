"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApiProblem, BootstrapData } from "./types";

type Toast = { title: string; text: string } | null;

type ProductContextValue = {
  data: BootstrapData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  connectWallet: () => Promise<void>;
  signOut: () => Promise<void>;
  toast: Toast;
  notify: (title: string, text: string) => void;
  dismissToast: () => void;
  walletConnected: boolean;
  connectClientWallet: () => Promise<void>;
  signInOpen: boolean;
  setSignInOpen: (open: boolean) => void;
  connectWalletOpen: boolean;
  setConnectWalletOpen: (open: boolean) => void;
};

const ProductContext = createContext<ProductContextValue | null>(null);

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const method = (init?.method || "GET").toUpperCase();
  if (!new Set(["GET", "HEAD", "OPTIONS"]).has(method) && !headers.has("idempotency-key")) {
    headers.set("idempotency-key", crypto.randomUUID());
  }
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  const payload = await response.json().catch(() => null) as { data?: T; detail?: string; title?: string; code?: string; requestId?: string } | null;
  if (!response.ok) {
    const error = new Error(payload?.detail || payload?.title || `Request failed with status ${response.status}.`) as ApiProblem;
    error.status = response.status;
    error.code = payload?.code;
    error.requestId = payload?.requestId;
    throw error;
  }
  return payload?.data as T;
}

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

declare global {
  interface Window { ethereum?: EthereumProvider }
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [walletConnected, setWalletConnected] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [connectWalletOpen, setConnectWalletOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await requestJson<BootstrapData>("/api/v1/bootstrap");
      setData(next);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "NexMarkets data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum || !data?.wallet.address) {
      setWalletConnected(false);
      return;
    }
    const handleAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      const connected = Boolean(list && list[0] && list[0].toLowerCase() === data.wallet.address?.toLowerCase());
      setWalletConnected(connected);
    };
    ethereum.request({ method: "eth_accounts" }).then(handleAccounts).catch(() => setWalletConnected(false));
    
    const provider = ethereum as { on?: (event: string, callback: (...args: any[]) => void) => void; removeListener?: (event: string, callback: (...args: any[]) => void) => void };
    if (provider.on) {
      provider.on("accountsChanged", handleAccounts);
      provider.on("chainChanged", () => {
        ethereum.request({ method: "eth_accounts" }).then(handleAccounts).catch(() => setWalletConnected(false));
      });
    }
    return () => {
      if (provider.removeListener) {
        provider.removeListener("accountsChanged", handleAccounts);
      }
    };
  }, [data]);

  const notify = useCallback((title: string, text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ title, text });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const connectWallet = useCallback(async () => {
    const ethereum = window.ethereum;
    if (!ethereum) throw new Error("Install or open an EVM wallet to continue.");
    const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
    const address = accounts[0];
    if (!address) throw new Error("The wallet did not return an account.");
    const chainHex = await ethereum.request({ method: "eth_chainId" }) as string;
    const chainId = Number.parseInt(chainHex, 16);
    if (chainId !== 4663 && chainId !== 46630) {
      throw new Error("Switch the wallet to Robinhood Chain or Robinhood Chain testnet.");
    }
    const challenge = await requestJson<{ challengeId: string; message: string }>("/api/v1/auth/wallet/challenge", {
      method: "POST",
      body: JSON.stringify({ address, chainId }),
    });
    const signature = await ethereum.request({ method: "personal_sign", params: [challenge.message, address] }) as string;
    await requestJson("/api/v1/auth/wallet/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: challenge.challengeId, address, signature }),
    });
    await refresh();
    setSignInOpen(false);
    notify("Wallet verified", "Your real wallet is now connected to this account.");
  }, [notify, refresh]);

  const connectClientWallet = useCallback(async () => {
    const ethereum = window.ethereum;
    if (!ethereum) throw new Error("Install or open an EVM wallet to continue.");
    const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
    const address = accounts[0];
    if (!address) throw new Error("The wallet did not return an account.");
    const chainHex = await ethereum.request({ method: "eth_chainId" }) as string;
    const chainId = Number.parseInt(chainHex, 16);
    if (chainId !== 4663 && chainId !== 46630) {
      throw new Error("Switch the wallet to Robinhood Chain or Robinhood Chain testnet.");
    }
    if (data?.wallet.address && address.toLowerCase() !== data.wallet.address.toLowerCase()) {
      throw new Error(`Connect the registered wallet address: ${data.wallet.address.slice(0, 6)}…${data.wallet.address.slice(-4)}`);
    }
    setWalletConnected(true);
    setConnectWalletOpen(false);
    notify("Wallet connected", "Your wallet is now connected to this session.");
  }, [data, notify]);

  const signOut = useCallback(async () => {
    await requestJson("/api/v1/auth/logout", { method: "POST", body: "{}" });
    await refresh();
    notify("Signed out", "Private workspace data has been cleared from this view.");
  }, [notify, refresh]);

  const value = useMemo<ProductContextValue>(() => ({
    data, loading, error, refresh, api: requestJson, connectWallet, signOut, toast, notify,
    dismissToast: () => setToast(null),
    walletConnected, connectClientWallet,
    signInOpen, setSignInOpen,
    connectWalletOpen, setConnectWalletOpen
  }), [connectWallet, data, error, loading, notify, refresh, signOut, toast, walletConnected, connectClientWallet, signInOpen, connectWalletOpen]);

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProduct() {
  const value = useContext(ProductContext);
  if (!value) throw new Error("useProduct must be used within ProductProvider.");
  return value;
}
