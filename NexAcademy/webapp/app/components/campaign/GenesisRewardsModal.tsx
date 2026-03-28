'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// GenesisRewardsModal — Premium celebration popup for NexID partner campaigns
//
// Shown after campaign completion (post-quiz gate) for genesis reward campaigns.
// Displays Genesis Points earned, domain claiming form, and completion stats.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_DOMAIN_LENGTH = 5;
const MAX_DOMAIN_LENGTH = 32;

interface GenesisRewardsModalProps {
  campaignId: number;
  campaignTitle: string;
  sponsorName: string;
  score: number;
  domainSpotsRemaining: number | null;
  domainClaimed: string | null;
  onDomainClaimed: (domain: string) => void;
  onDismiss: () => void;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export default function GenesisRewardsModal({
  campaignId,
  campaignTitle,
  sponsorName,
  score,
  domainSpotsRemaining,
  domainClaimed: initialDomainClaimed,
  onDomainClaimed,
  onDismiss,
}: GenesisRewardsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<'celebration' | 'claim'>('celebration');
  const [domainInput, setDomainInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimedDomain, setClaimedDomain] = useState<string | null>(initialDomainClaimed);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = 'hidden';
    // Fade out confetti after 3s
    const t = setTimeout(() => setShowConfetti(false), 3000);
    return () => {
      document.body.style.overflow = '';
      clearTimeout(t);
    };
  }, []);

  const handleClaimDomain = useCallback(async () => {
    const trimmed = domainInput.trim();
    if (trimmed.length < MIN_DOMAIN_LENGTH) return;

    setClaiming(true);
    setClaimError(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/claim-domain`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ domain: trimmed }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to claim domain');
      }

      setClaimedDomain(trimmed);
      onDomainClaimed(trimmed);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Failed to claim domain');
    } finally {
      setClaiming(false);
    }
  }, [campaignId, domainInput, onDomainClaimed]);

  if (!mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-md">
      {/* Confetti particles */}
      {showConfetti && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
              }}
            >
              <div
                className="h-2 w-2 rounded-sm"
                style={{
                  backgroundColor: ['#FFB000', '#22C55E', '#3B82F6', '#A855F7', '#EC4899', '#FFD700'][i % 6],
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="w-full max-w-lg mx-4 max-h-[100dvh] overflow-y-auto">
        {/* ── Celebration Phase ─────────────────────────────── */}
        {phase === 'celebration' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Trophy icon */}
            <div className="text-center mb-8">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#FFB000]/20 to-[#FFD700]/10 border-2 border-[#FFB000]/30 flex items-center justify-center shadow-[0_0_60px_rgba(255,176,0,0.15)]">
                <svg className="w-12 h-12 text-[#FFD700]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 3h14l-1.5 2H20a1 1 0 011 1v2a4 4 0 01-3 3.874V13a5 5 0 01-3.09 4.621L15 22H9l.09-4.379A5 5 0 016 13v-1.126A4 4 0 013 8V6a1 1 0 011-1h1.5L4 3h1zm2.5 2L6 7h-.001L6 8a2 2 0 002 2V6.5L7.5 5zM16.5 5L16 6.5V10a2 2 0 002-2V7h-.001L16.5 5zM12 5H9.5l-1 2v6a3 3 0 006 0V7l-1-2H12z" />
                </svg>
              </div>

              <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-[#FFB000]/80 mb-2">
                Campaign Complete
              </div>
              <h2 className="font-display font-bold text-3xl text-white mb-2 tracking-tight">
                Genesis Rewards Unlocked
              </h2>
              <p className="text-[13px] text-neutral-400 max-w-sm mx-auto">
                You&apos;ve completed <span className="text-white font-medium">{campaignTitle}</span> by{' '}
                <span className="text-[#FFB000]">{sponsorName}</span>
              </p>
            </div>

            {/* Rewards cards */}
            <div className="space-y-3 mb-8">
              {/* Genesis Points */}
              <div className="rounded-2xl border border-[#FFB000]/20 bg-gradient-to-r from-[#FFB000]/[.06] to-transparent p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#FFB000]/60 mb-1">
                      Genesis Points
                    </div>
                    <div className="text-2xl font-display font-black text-[#FFD700]">+100</div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-[#FFB000]/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#FFB000]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Campaign Score */}
              <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 mb-1">
                      Your Score
                    </div>
                    <div className={`text-2xl font-display font-black ${score >= 60 ? 'text-green-400' : 'text-red-400'}`}>
                      {score}
                    </div>
                  </div>
                  <div className={`text-[11px] font-bold px-3 py-1.5 rounded-lg ${score >= 60 ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {score >= 60 ? 'PASSED' : 'BELOW THRESHOLD'}
                  </div>
                </div>
              </div>

              {/* Domain Offer */}
              {!claimedDomain && (domainSpotsRemaining === null || domainSpotsRemaining > 0) && (
                <div className="rounded-2xl border border-[#FFB000]/20 bg-gradient-to-r from-[#FFB000]/[.04] to-transparent p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#FFB000]/60 mb-1">
                        Domain Reward
                      </div>
                      <div className="text-sm text-white font-medium">Free .id domain (5+ chars)</div>
                    </div>
                    <div className="text-[10px] font-mono text-neutral-500">
                      {domainSpotsRemaining !== null ? `${domainSpotsRemaining} spots left` : ''}
                    </div>
                  </div>
                </div>
              )}

              {claimedDomain && (
                <div className="rounded-2xl border border-green-500/20 bg-green-500/[.06] p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-green-400/60 mb-0.5">
                        Domain Claimed
                      </div>
                      <div className="text-lg font-display font-bold text-green-400">
                        {claimedDomain}.id
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              {!claimedDomain && (domainSpotsRemaining === null || domainSpotsRemaining > 0) && (
                <button
                  onClick={() => setPhase('claim')}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FFB000] to-[#FFD700] text-black text-[14px] font-display font-bold transition-all hover:shadow-[0_0_40px_rgba(255,176,0,0.25)] active:scale-[0.98]"
                >
                  Claim Your .id Domain
                </button>
              )}
              <button
                onClick={onDismiss}
                className={`w-full py-4 rounded-2xl text-[14px] font-display font-bold transition-all active:scale-[0.98] ${
                  claimedDomain || (domainSpotsRemaining !== null && domainSpotsRemaining <= 0)
                    ? 'bg-[#FFB000] text-black hover:shadow-[0_0_40px_rgba(255,176,0,0.25)]'
                    : 'border border-white/[.08] bg-white/[.02] text-neutral-400 hover:text-white hover:border-white/20'
                }`}
              >
                {claimedDomain ? 'Done' : 'Skip for Now'}
              </button>
            </div>
          </div>
        )}

        {/* ── Claim Phase ──────────────────────────────────── */}
        {phase === 'claim' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Back button */}
            <button
              onClick={() => { setPhase('celebration'); setClaimError(null); }}
              className="flex items-center gap-2 text-[12px] text-neutral-500 hover:text-white transition-colors mb-8"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#FFB000]/10 border border-[#FFB000]/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-[#FFD700]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              <h3 className="font-display font-bold text-2xl text-white mb-2">Claim Your Domain</h3>
              <p className="text-[12px] text-neutral-500">
                Choose a name with 5 or more characters for your .id domain.
              </p>
            </div>

            {claimedDomain ? (
              <div className="text-center">
                <div className="rounded-2xl border border-green-500/20 bg-green-500/[.06] p-8 mb-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-green-400/60 mb-2">
                    Successfully Claimed
                  </div>
                  <div className="text-3xl font-display font-black text-green-400">
                    {claimedDomain}.id
                  </div>
                </div>
                <button
                  onClick={onDismiss}
                  className="w-full py-4 rounded-2xl bg-green-500 text-black text-[14px] font-display font-bold transition-all hover:bg-green-400 active:scale-[0.98]"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <div className="flex items-stretch rounded-2xl border border-white/[.08] bg-white/[.02] overflow-hidden focus-within:border-[#FFB000]/40 transition-colors">
                    <input
                      type="text"
                      maxLength={MAX_DOMAIN_LENGTH}
                      value={domainInput}
                      onChange={(e) => {
                        setDomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                        setClaimError(null);
                      }}
                      placeholder="yourname"
                      autoFocus
                      className="flex-1 bg-transparent px-5 py-4 text-lg text-white outline-none placeholder:text-neutral-600 font-display"
                    />
                    <div className="flex items-center px-5 text-lg font-display font-bold text-[#FFB000]/60 border-l border-white/[.06]">
                      .id
                    </div>
                  </div>

                  {domainInput.length > 0 && domainInput.length < MIN_DOMAIN_LENGTH && (
                    <div className="mt-2 text-[11px] text-amber-400/80 font-mono">
                      {MIN_DOMAIN_LENGTH - domainInput.length} more character{MIN_DOMAIN_LENGTH - domainInput.length !== 1 ? 's' : ''} needed
                    </div>
                  )}

                  {claimError && (
                    <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[.06] px-4 py-3 text-[12px] text-red-400">
                      {claimError}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleClaimDomain}
                  disabled={claiming || domainInput.trim().length < MIN_DOMAIN_LENGTH}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FFB000] to-[#FFD700] text-black text-[14px] font-display font-bold transition-all hover:shadow-[0_0_40px_rgba(255,176,0,0.25)] active:scale-[0.98] disabled:opacity-40 disabled:hover:shadow-none"
                >
                  {claiming ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-black/20 border-t-black animate-spin" />
                      Claiming...
                    </span>
                  ) : (
                    `Claim ${domainInput.length >= MIN_DOMAIN_LENGTH ? domainInput + '.id' : 'Domain'}`
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* CSS for confetti animation */}
      <style jsx>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti-fall linear forwards;
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
}
