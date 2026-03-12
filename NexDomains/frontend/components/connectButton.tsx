'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useDisconnect } from 'wagmi';
import { useENSName } from '../hooks/getPrimaryName';
import { Avatar } from './useAvatar';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const CustomConnect = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { login, logout, ready, authenticated } = usePrivy();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  const { name } = useENSName({
    owner: address as `0x${string}`,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!ready) {
    return (
      <div style={{ opacity: 0, pointerEvents: 'none', userSelect: 'none' }}>
        <button
          className="bg-[#FFB000] text-black p-8 py-[8px] font-bold rounded-full"
          type="button"
        >
          Loading...
        </button>
      </div>
    );
  }

  const isStuck = authenticated && !isConnected;

  const handleLogin = async () => {
    if (isStuck) {
      await logout();
    }
    login();
  };

  if (!authenticated || !isConnected) {
    return (
      <button
        className="bg-[#FFB000] text-black p-8 py-[8px] font-bold rounded-full hover:scale-105 duration-200 cursor-pointer"
        type="button"
        onClick={handleLogin}
      >
        {isStuck ? 'Reconnect' : 'Login'}
      </button>
    );
  }

  const safeName = (name && typeof name === 'string') ? name : '';
  const displayName = safeName || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected');

  const handleDisconnect = async () => {
    disconnect();
    await logout();
    setDropdownOpen(false);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        className="bg-neutral-900 p-3 py-[8px] rounded-full cursor-pointer flex gap-2 items-center hover:scale-105 duration-200"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        type="button"
      >
        <Avatar
          name={safeName || (address as string)}
          className="w-8 h-8"
        />
        <div className="text-white font-bold">{displayName}</div>
      </button>

      {dropdownOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: '160px',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            zIndex: 1000,
            background: '#1a1b1f',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {/* Dashboard - hidden on mobile */}
          <button
            className="hidden sm:flex"
            onClick={() => { router.push('/dashboard'); setDropdownOpen(false); }}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              alignItems: 'center',
              gap: '8px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Dashboard
          </button>

          {/* Disconnect - always shown */}
          <button
            onClick={handleDisconnect}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              color: '#ef4444',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
};
