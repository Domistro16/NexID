'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, useSignMessage, useSwitchChain } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { base } from 'viem/chains';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { address, isConnected, chainId } = useAccount();
  const { authenticated, login, ready } = usePrivy();
  const { signMessageAsync } = useSignMessage();
  const { switchChain } = useSwitchChain();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isConnected && chainId && chainId !== base.id) {
      switchChain({ chainId: base.id });
    }
  }, [isConnected, chainId, switchChain]);

  useEffect(() => {
    if (!ready) return;

    async function checkAdmin() {
      setLoading(true);
      try {
        const existingToken = localStorage.getItem('auth_token');
        if (existingToken) {
          const res = await fetch('/api/admin/stats', {
            headers: { Authorization: `Bearer ${existingToken}` },
          });

          if (res.ok) {
            setIsAdmin(true);
            setLoading(false);
            return;
          }

          // Only purge auth on explicit auth failures; keep token on transient server/network issues.
          if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
          }
        }

        if (!isConnected || !address || !authenticated) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        const nonceRes = await fetch('/api/auth/nonce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: address }),
        });

        if (!nonceRes.ok) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        const { message } = await nonceRes.json();
        const signature = await signMessageAsync({ message });

        const verifyRes = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: address, signature, message }),
        });

        if (!verifyRes.ok) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        const verifyData = await verifyRes.json();
        localStorage.setItem('auth_token', verifyData.token);
        localStorage.setItem('auth_user', JSON.stringify(verifyData.user));

        const adminRes = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${verifyData.token}` },
        });
        setIsAdmin(adminRes.ok);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    }

    checkAdmin();
  }, [address, isConnected, authenticated, ready, signMessageAsync]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (isAdmin) {
    return <>{children}</>;
  }

  if (!isConnected || !authenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Connect Wallet</h1>
          <p className="text-gray-400 mb-4">Please connect your wallet to access the admin dashboard.</p>
          <button
            onClick={login}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-500 transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Access Denied</h1>
          <p className="text-gray-400">You don&apos;t have admin permissions.</p>
          <Link href="/" className="text-blue-400 hover:underline mt-4 inline-block">
            Go back home
          </Link>
        </div>
      </div>
    );
  }
}
