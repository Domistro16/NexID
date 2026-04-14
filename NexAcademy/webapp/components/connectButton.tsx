'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useSignMessage, useSwitchChain } from 'wagmi';
import { base } from 'viem/chains';
import { WalletModal } from './WalletModal';
import { useENSName } from '@/hooks/getPrimaryName';
import { useRouter, usePathname } from 'next/navigation';

interface AuthState {
    isAuthenticated: boolean;
    token: string | null;
    user: {
        walletAddress: string;
        totalPoints: number;
        isAdmin: boolean;
    } | null;
    domainName: string | null;
}

function emitAuthChanged() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('nexid-auth-changed'));
    }
}

// Read existing auth from localStorage synchronously at init time
function getInitialAuthState(): AuthState {
    if (typeof window === 'undefined') {
        return { isAuthenticated: false, token: null, user: null, domainName: null };
    }
    try {
        const token = localStorage.getItem('auth_token');
        const userStr = localStorage.getItem('auth_user');
        if (token) {
            if (userStr) {
                const user = JSON.parse(userStr);
                return { isAuthenticated: true, token, user, domainName: null };
            }
            return { isAuthenticated: true, token, user: null, domainName: null };
        }
    } catch {
        // ignore
    }
    return { isAuthenticated: false, token: null, user: null, domainName: null };
}

export function CustomConnect() {
    const { ready, authenticated } = usePrivy();
    const { address, isConnected, chainId } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const { switchChain } = useSwitchChain();
    const router = useRouter();
    const pathname = usePathname();
    const [authState, setAuthState] = useState<AuthState>(getInitialAuthState);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [showWalletModal, setShowWalletModal] = useState(false);
    const hasAttemptedAuth = useRef(false);

    const hasPendingWalletResumeIntent = () => {
        if (typeof window === 'undefined') return false;
        try {
            return Boolean(sessionStorage.getItem('nexid_gateway_pending_wallet_auth'));
        } catch {
            return false;
        }
    };

    const hasPendingSocialOAuthIntent = () => {
        if (typeof window === 'undefined') return false;
        try {
            return sessionStorage.getItem('nexid_gateway_pending_social_oauth') === 'true';
        } catch {
            return false;
        }
    };

    // Auto-switch to Base mainnet if on wrong chain.
    // Campaign detail pages manage their own chain (onchain verification may
    // require a different chain, e.g., MegaETH Testnet) — don't fight them.
    useEffect(() => {
        if (!isConnected || !chainId) return;
        if (chainId === base.id) return;
        if (pathname && pathname.startsWith('/academy/campaign/')) return;
        switchChain({ chainId: base.id });
    }, [isConnected, chainId, switchChain, pathname]);

    // Keep local auth state in sync with storage updates (gateway login/logout, other tabs, modal disconnect).
    useEffect(() => {
        const syncAuthState = () => {
            setAuthState(getInitialAuthState());
        };

        const validateAuthToken = async () => {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            try {
                const res = await fetch('/api/auth/me', {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!res.ok) {
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('auth_user');
                    setAuthState({ isAuthenticated: false, token: null, user: null, domainName: null });
                    return;
                }

                const body = await res.json();
                if (body?.user) {
                    localStorage.setItem('auth_user', JSON.stringify(body.user));
                    setAuthState({ isAuthenticated: true, token, user: body.user, domainName: null });
                }
            } catch {
                // Keep current state on transient network issues.
            }
        };

        syncAuthState();
        void validateAuthToken();
        window.addEventListener('storage', syncAuthState);
        window.addEventListener('nexid-auth-changed', syncAuthState as EventListener);
        return () => {
            window.removeEventListener('storage', syncAuthState);
            window.removeEventListener('nexid-auth-changed', syncAuthState as EventListener);
        };
    }, []);

    // Wallet disconnect should not wipe backend session token (gateway auth is token-based).
    useEffect(() => {
        if (!ready) return;
        if (!isConnected || !authenticated) {
            hasAttemptedAuth.current = false;
        }
    }, [ready, isConnected, authenticated]);

    const authWalletAddress = authState.user?.walletAddress;
    const preferredWalletAddress = authWalletAddress || address || '';
    // Resolve primary .id domain name via the SafuDomains reverse lookup chain
    const { name: domainName } = useENSName({
        owner: (preferredWalletAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    });
    const authenticate = useCallback(async () => {
        if (!address || isAuthenticating) return;

        setIsAuthenticating(true);

        try {
            const nonceRes = await fetch('/api/auth/nonce', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress: address }),
            });

            if (!nonceRes.ok) {
                throw new Error('Failed to get nonce');
            }

            const { message } = await nonceRes.json();
            const signature = await signMessageAsync({ message });

            const verifyRes = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: address,
                    signature,
                    message,
                }),
            });

            if (!verifyRes.ok) {
                throw new Error('Verification failed');
            }

            const { token, user } = await verifyRes.json();
            localStorage.setItem('auth_token', token);
            localStorage.setItem('auth_user', JSON.stringify(user));
            emitAuthChanged();

            setAuthState({
                isAuthenticated: true,
                token,
                user,
                domainName: null,
            });
        } catch {
        } finally {
            setIsAuthenticating(false);
        }
    }, [address, isAuthenticating, signMessageAsync]);

    // Only trigger sign-message flow when truly not authenticated.
    // If the gateway already issued a valid auth_token (stored in localStorage),
    // skip re-authentication entirely — the backend session is wallet-agnostic.
    useEffect(() => {
        if (
            isConnected &&
            authenticated &&
            address &&
            !isAuthenticating &&
            !hasAttemptedAuth.current
        ) {
            // If we already have a valid backend token (from gateway or previous session), skip.
            // This prevents MetaMask from popping up when the user already authenticated
            // via Google/social login through the gateway with a Privy embedded wallet.
            if (authState.isAuthenticated && authState.token) {
                return;
            }

            // Check localStorage one more time in case React state is stale
            try {
                const token = localStorage.getItem('auth_token');
                if (token) {
                    const userStr = localStorage.getItem('auth_user');
                    const parsedUser = userStr ? JSON.parse(userStr) : null;
                    setAuthState({ isAuthenticated: true, token, user: parsedUser, domainName: null });
                    return;
                }
            } catch {
                // fall through to sign
            }

            hasAttemptedAuth.current = true;
            authenticate();
        }
    }, [
        isConnected,
        authenticated,
        address,
        authState.isAuthenticated,
        authState.token,
        isAuthenticating,
        authenticate,
    ]);

    if (!ready) {
        return (
            <button
                disabled
                className="rounded-full border border-[#222] bg-[#111] px-4 py-1.5 text-xs font-medium text-white opacity-60"
            >
                Loading...
            </button>
        );
    }

    const hasBackendAuth = authState.isAuthenticated && Boolean(authState.token);
    const shouldFinalizeLogin =
        !hasBackendAuth
        && (
            isAuthenticating
            || (isConnected && authenticated && Boolean(address))
            || hasPendingWalletResumeIntent()
            || hasPendingSocialOAuthIntent()
        );

    if (shouldFinalizeLogin) {
        return (
            <button
                disabled
                className="rounded-full border border-[#222] bg-[#111] px-4 py-1.5 text-xs font-medium text-white opacity-60"
            >
                {isAuthenticating ? 'Signing...' : 'Finalizing login...'}
            </button>
        );
    }

    if (!hasBackendAuth) {
        return (
            <button
                onClick={() => router.push('/academy-gateway')}
                className="rounded-full border border-[#222] bg-[#111] px-4 py-1.5 text-xs font-medium text-white shadow-inner-glaze transition-colors hover:border-white/20"
            >
                Login
            </button>
        );
    }

    const displayText = (domainName as string | undefined)
        || (preferredWalletAddress
            ? `${preferredWalletAddress.slice(0, 6)}...${preferredWalletAddress.slice(-4)}`
            : 'Connected');
    return (
        <>
            <button
                onClick={() => setShowWalletModal(true)}
                className="flex items-center gap-2.5 rounded-full border border-[#222] bg-[#111] px-4 py-1.5 text-xs font-medium text-white shadow-inner-glaze transition-colors hover:border-white/20"
                type="button"
            >
                <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                {displayText}
            </button>

            <WalletModal
                isOpen={showWalletModal}
                onRequestClose={() => setShowWalletModal(false)}
                address={preferredWalletAddress}
                name={(domainName as string | undefined) || ''}
            />
        </>
    );
}
