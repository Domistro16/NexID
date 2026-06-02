"use client";

import { ConnectButton, useConnectModal } from "@rainbow-me/rainbowkit";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { fetchAuthUserApi, logoutApi, requestWalletNonceApi, verifyWalletApi } from "@/lib/services/nexid-client";
import type { AuthUser } from "@/lib/types/nexid";
import { usePrimaryDomainName } from "@/components/nexid/shared/use-primary-domain-name";

let sessionUserRequest: Promise<AuthUser | null> | null = null;

function walletMatches(user: AuthUser | null, address?: string) {
  return Boolean(user && (!address || user.walletAddress.toLowerCase() === address.toLowerCase()));
}

function fetchExistingSession() {
  sessionUserRequest ??= fetchAuthUserApi().finally(() => {
    sessionUserRequest = null;
  });
  return sessionUserRequest;
}

function publishAuthUser(user: AuthUser | null) {
  window.dispatchEvent(new CustomEvent("nexid:auth-changed", { detail: { user } }));
}

export function WalletChoiceButton({
  authenticated,
  onSign,
  onDisconnect,
  connectLabel = "Connect wallet"
}: {
  authenticated: boolean;
  onSign: () => void;
  onDisconnect: () => void;
  connectLabel?: string;
}) {
  return (
    <ConnectButton.Custom>
      {({ account, mounted, openConnectModal }) => {
        const connected = mounted && account;
        if (authenticated) return <button className="btn" onClick={onDisconnect}>Disconnect</button>;
        return <button className="primary" onClick={connected ? onSign : openConnectModal}>{connected ? "Sign in" : connectLabel}</button>;
      }}
    </ConnectButton.Custom>
  );
}

export function useWalletSession(initialUser: AuthUser | null = null) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [busy, setBusy] = useState(false);
  const { address } = useAccount();
  const primaryDomainName = usePrimaryDomainName(address);
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const { disconnectAsync } = useDisconnect();

  useEffect(() => {
    if (initialUser) setUser(initialUser);
  }, [initialUser]);

  useEffect(() => {
    let cancelled = false;

    if (!initialUser) {
      void fetchExistingSession()
        .then((sessionUser) => {
          if (!cancelled && sessionUser) setUser(sessionUser);
        })
        .catch(() => undefined);
    }

    const onAuthChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ user?: AuthUser | null }>).detail;
      if (detail && "user" in detail) setUser(detail.user ?? null);
    };

    window.addEventListener("nexid:auth-changed", onAuthChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("nexid:auth-changed", onAuthChanged);
    };
  }, [initialUser]);

  const ensureSignedIn = useCallback(async () => {
    if (walletMatches(user, address)) return user!;

    if (!address) {
      const sessionUser = await fetchExistingSession();
      if (sessionUser) {
        setUser(sessionUser);
        publishAuthUser(sessionUser);
        return sessionUser;
      }
      openConnectModal?.();
      throw new Error("Choose a wallet from RainbowKit to continue.");
    }

    setBusy(true);
    try {
      const sessionUser = await fetchExistingSession().catch(() => null);
      if (walletMatches(sessionUser, address)) {
        setUser(sessionUser);
        publishAuthUser(sessionUser);
        return sessionUser!;
      }

      const nonce = await requestWalletNonceApi(address);
      const signature = await signMessageAsync({ message: nonce.message });
      const nextUser = await verifyWalletApi({
        walletAddress: address,
        message: nonce.message,
        signature,
        displayName: primaryDomainName ?? undefined,
        primaryDomainName: primaryDomainName ?? undefined
      });
      setUser(nextUser);
      publishAuthUser(nextUser);
      return nextUser;
    } finally {
      setBusy(false);
    }
  }, [address, openConnectModal, primaryDomainName, signMessageAsync, user]);

  const disconnect = useCallback(async () => {
    await logoutApi().catch(() => ({ ok: false }));
    await disconnectAsync().catch(() => undefined);
    setUser(null);
    publishAuthUser(null);
  }, [disconnectAsync]);

  return { user, setUser, busy, address, primaryDomainName, ensureSignedIn, disconnect };
}
