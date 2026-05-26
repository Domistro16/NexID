"use client";

import { ConnectButton, useConnectModal } from "@rainbow-me/rainbowkit";
import { useCallback, useState } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { logoutApi, requestWalletNonceApi, verifyWalletApi } from "@/lib/services/nexid-client";
import type { AuthUser } from "@/lib/types/nexid";
import { usePrimaryDomainName } from "@/components/nexid/shared/use-primary-domain-name";

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

  const ensureSignedIn = useCallback(async () => {
    if (user) return user;
    if (!address) {
      openConnectModal?.();
      throw new Error("Choose a wallet from RainbowKit to continue.");
    }
    setBusy(true);
    try {
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
      return nextUser;
    } finally {
      setBusy(false);
    }
  }, [address, openConnectModal, primaryDomainName, signMessageAsync, user]);

  const disconnect = useCallback(async () => {
    await logoutApi().catch(() => ({ ok: false }));
    await disconnectAsync().catch(() => undefined);
    setUser(null);
  }, [disconnectAsync]);

  return { user, setUser, busy, address, primaryDomainName, ensureSignedIn, disconnect };
}
