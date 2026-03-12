'use client';

import { useReadContract } from 'wagmi';
import { constants } from '../constant';

// ABI derived from ReferralVerifier.sol contract source
const REFERRAL_VERIFIER_ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'referralCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'totalEarnings',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'referrer', type: 'address' }],
    name: 'getReferralPct',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export function useReferralStats(address: `0x${string}` | undefined) {
  // Get referral count
  const { data: referralCount, isLoading: countLoading } = useReadContract({
    address: constants.Referral,
    abi: REFERRAL_VERIFIER_ABI,
    functionName: 'referralCount',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Get total earnings in native token (BNB, stored with 18 decimals)
  const { data: totalEarnings, isLoading: earningsLoading } = useReadContract({
    address: constants.Referral,
    abi: REFERRAL_VERIFIER_ABI,
    functionName: 'totalEarnings',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Get current referral percentage (25% base, 30% after 5 referrals)
  const { data: referralPct, isLoading: pctLoading } = useReadContract({
    address: constants.Referral,
    abi: REFERRAL_VERIFIER_ABI,
    functionName: 'getReferralPct',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  return {
    referralCount: referralCount as bigint | undefined,
    totalEarnings: totalEarnings as bigint | undefined,
    referralPct: referralPct as bigint | undefined,
    isLoading: countLoading || earningsLoading || pctLoading,
  };
}
