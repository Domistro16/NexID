"use client";

import { useCallback, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type VerificationPhase = "idle" | "submitting" | "success" | "error";

export interface OnchainVerificationCardProps {
  campaignId: number;
  campaignSlug: string;
  /** "transaction" (submit tx hash) or "signature" (sign a message) */
  verificationMode: "transaction" | "signature";
  /** Human-readable description of the required action */
  actionDescription: string | null;
  /** Primary chain label (e.g. "MegaETH Testnet") */
  chainLabel: string;
  /** Campaign primary chain key (e.g. "base", "megaeth", "ethereum") */
  primaryChain: string;
  /** Optional explicit chainId override from onchainConfig.chainId */
  chainIdOverride: number | null;
  /** Whether the on-chain step has already been verified */
  alreadyVerified: boolean;
  /** Called after successful verification to advance the flow */
  onVerified: (score: number) => void;
}

// Registry of known chains used for signature-mode verification.
// Mirrors CHAIN_MAP in lib/services/onchain-verification.service.ts so the
// wallet network prompt matches what the backend expects.
type ChainMeta = {
  chainId: number;
  chainName: string;
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
};

const CHAIN_REGISTRY: Record<string, ChainMeta> = {
  base: {
    chainId: 8453,
    chainName: "Base",
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
  ethereum: {
    chainId: 1,
    chainName: "Ethereum",
    rpcUrls: ["https://cloudflare-eth.com"],
    blockExplorerUrls: ["https://etherscan.io"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
  arbitrum: {
    chainId: 42161,
    chainName: "Arbitrum One",
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://arbiscan.io"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
  hyperliquid: {
    chainId: 998,
    chainName: "Hyperliquid L1",
    rpcUrls: ["https://rpc.hyperliquid.xyz"],
    blockExplorerUrls: ["https://explorer.hyperliquid.xyz"],
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  },
  megaeth: {
    chainId: 6342,
    chainName: "MegaETH Testnet",
    rpcUrls: ["https://carrot.megaeth.com/rpc"],
    blockExplorerUrls: ["https://www.megaexplorer.xyz"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
};

function resolveChainMeta(primaryChain: string, override: number | null): ChainMeta | null {
  const byKey = CHAIN_REGISTRY[primaryChain];
  if (override && byKey && byKey.chainId === override) return byKey;
  if (override) {
    const match = Object.values(CHAIN_REGISTRY).find((c) => c.chainId === override);
    if (match) return match;
  }
  return byKey ?? null;
}

function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

async function ensureChain(eth: EthereumProvider, meta: ChainMeta): Promise<void> {
  const hexId = toHexChainId(meta.chainId);
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (err) {
    // 4902 = chain not added to wallet. Try adding it, then switch.
    const errorCode = (err as { code?: number })?.code;
    if (errorCode === 4902 || errorCode === -32603) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: meta.chainName,
            rpcUrls: meta.rpcUrls,
            blockExplorerUrls: meta.blockExplorerUrls,
            nativeCurrency: meta.nativeCurrency,
          },
        ],
      });
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
      return;
    }
    throw err;
  }
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OnchainVerificationCard({
  campaignId,
  campaignSlug,
  verificationMode,
  actionDescription,
  chainLabel,
  primaryChain,
  chainIdOverride,
  alreadyVerified,
  onVerified,
}: OnchainVerificationCardProps) {
  const [phase, setPhase] = useState<VerificationPhase>(alreadyVerified ? "success" : "idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [onchainScore, setOnchainScore] = useState<number | null>(null);

  // ── Transaction Mode: Submit tx hash ────────────────────────────────────
  const handleSubmitTx = useCallback(async () => {
    const hash = txHash.trim();
    if (!hash || !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      setError("Enter a valid 66-character transaction hash (0x + 64 hex chars)");
      return;
    }

    setError(null);
    setPhase("submitting");

    try {
      const res = await fetch(`/api/campaigns/${campaignSlug}/verify-onchain`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ txHash: hash }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Verification failed");
      }

      if (body?.verified) {
        setOnchainScore(body.onchainScore ?? 80);
        setPhase("success");
        onVerified(body.onchainScore ?? 80);
      } else {
        setError(body?.reason ?? "Transaction could not be verified. Please check and try again.");
        setPhase("idle");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setPhase("idle");
    }
  }, [txHash, campaignSlug, onVerified]);

  // ── Signature Mode: Sign a message ──────────────────────────────────────
  const handleSignMessage = useCallback(async () => {
    setError(null);
    setPhase("submitting");

    try {
      // Access window.ethereum for wallet signature
      const eth = (window as Window & {
        ethereum?: EthereumProvider;
      }).ethereum;

      if (!eth) {
        throw new Error("No wallet detected. Please connect a wallet first.");
      }

      // Get the connected account
      const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
      if (!accounts || accounts.length === 0) {
        const requested = (await eth.request({ method: "eth_requestAccounts" })) as string[];
        if (!requested || requested.length === 0) {
          throw new Error("No wallet account available. Please connect your wallet.");
        }
        accounts.push(...requested);
      }

      // Ensure the wallet is on the campaign's primary chain BEFORE the sign
      // prompt opens, so the user sees the correct network (e.g., MegaETH
      // Testnet) instead of the app's default Base connection.
      // Best-effort chain switch — message signing is chain-agnostic, so we
      // attempt the switch for UX (show the right network in MetaMask) but
      // never block signing if it fails.
      const chainMeta = resolveChainMeta(primaryChain, chainIdOverride);
      if (chainMeta) {
        try {
          await ensureChain(eth, chainMeta);
        } catch (err) {
          const code = (err as { code?: number })?.code;
          if (code === 4001) {
            // User explicitly rejected the network switch — bail.
            setPhase("idle");
            return;
          }
          // Any other failure (pending request, unsupported by wallet, etc.)
          // is non-fatal for signing. Continue.
          console.warn("Chain switch before sign failed (non-fatal):", err);
        }
      }

      const walletAddress = accounts[0];
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `NexAcademy Campaign Verification\nCampaign: ${campaignSlug}\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;

      // Request signature via personal_sign
      const signature = (await eth.request({
        method: "personal_sign",
        params: [message, walletAddress],
      })) as string;

      if (!signature) {
        throw new Error("Signature was rejected or empty.");
      }

      // Send to backend for verification
      const res = await fetch(`/api/campaigns/${campaignSlug}/verify-onchain`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ message, signature }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Signature verification failed");
      }

      if (body?.verified) {
        setOnchainScore(body.onchainScore ?? 80);
        setPhase("success");
        onVerified(body.onchainScore ?? 80);
      } else {
        setError(
          body?.reason ?? "Signature could not be verified. Ensure you signed with the correct wallet.",
        );
        setPhase("idle");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signature failed";
      // Don't show error if user just rejected the signature prompt
      if (/rejected|denied|cancelled|user refused/i.test(msg)) {
        setPhase("idle");
        return;
      }
      setError(msg);
      setPhase("idle");
    }
  }, [campaignSlug, onVerified, primaryChain, chainIdOverride]);

  // ── Render ──────────────────────────────────────────────────────────────
  const isSignature = verificationMode === "signature";

  return (
    <div className="stage st-onchain on">
      <div style={{ marginBottom: 16 }}>
        <div
          className="ey"
          style={{ color: "var(--emerald, #34d399)", marginBottom: 4 }}
        >
          On-Chain Verification
        </div>
        <div
          style={{
            fontFamily: "var(--dis)",
            fontWeight: 800,
            fontSize: 20,
            color: "#fff",
          }}
        >
          {isSignature ? "Sign a Message" : "Submit Transaction"}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--t3, #888)",
            marginTop: 4,
          }}
        >
          Chain: {chainLabel}
          {isSignature ? " · No gas required" : " · Transaction verification"}
        </div>
      </div>

      {/* Action description */}
      {actionDescription && (
        <div
          style={{
            background: "rgba(52,211,153,.06)",
            border: "1px solid rgba(52,211,153,.15)",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 13,
            color: "#d1fae5",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontFamily: "var(--mono, monospace)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "rgba(52,211,153,.6)",
              marginBottom: 4,
            }}
          >
            Required Action
          </div>
          {actionDescription}
        </div>
      )}

      {/* ── Already verified ───────────────────────────────────────────── */}
      {phase === "success" && (
        <div
          style={{
            background: "rgba(30,194,106,.08)",
            border: "1px solid rgba(30,194,106,.25)",
            borderRadius: 12,
            padding: "20px 16px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: "var(--green, #1ec26a)",
            }}
          >
            Verified
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--t3, #888)",
              marginTop: 4,
            }}
          >
            {isSignature
              ? "Message signature confirmed"
              : "Transaction verified on-chain"}
            {onchainScore !== null && ` · Score: ${onchainScore}`}
          </div>
        </div>
      )}

      {/* ── Submitting ─────────────────────────────────────────────────── */}
      {phase === "submitting" && (
        <div
          style={{
            textAlign: "center",
            padding: "24px 16px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontFamily: "var(--mono, monospace)",
              color: "var(--t3, #888)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          >
            {isSignature
              ? "Waiting for wallet signature..."
              : "Verifying transaction on-chain..."}
          </div>
        </div>
      )}

      {/* ── Idle: Transaction mode ─────────────────────────────────────── */}
      {phase === "idle" && !isSignature && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: "block",
                fontSize: 9,
                fontFamily: "var(--mono, monospace)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--t4, #666)",
                marginBottom: 4,
              }}
            >
              Transaction Hash
            </label>
            <input
              type="text"
              value={txHash}
              onChange={(e) => {
                setTxHash(e.target.value);
                setError(null);
              }}
              placeholder="0x..."
              style={{
                width: "100%",
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 12,
                fontFamily: "var(--mono, monospace)",
                color: "#fff",
                outline: "none",
              }}
            />
          </div>

          <button
            type="button"
            className="btn btn-gold"
            style={{ width: "100%" }}
            onClick={handleSubmitTx}
            disabled={!txHash.trim()}
          >
            Verify Transaction
          </button>
        </div>
      )}

      {/* ── Idle: Signature mode ───────────────────────────────────────── */}
      {phase === "idle" && isSignature && (
        <div>
          <div
            style={{
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.06)",
              borderRadius: 12,
              padding: "16px",
              marginBottom: 16,
              fontSize: 12,
              color: "var(--t2, #bbb)",
              lineHeight: 1.6,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontFamily: "var(--mono, monospace)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--t4, #666)",
                marginBottom: 6,
              }}
            >
              How it works
            </div>
            Click the button below to sign a verification message with your connected wallet.
            This proves you own the wallet address — no gas fees or transactions needed.
          </div>

          <button
            type="button"
            className="btn btn-gold"
            style={{ width: "100%" }}
            onClick={handleSignMessage}
          >
            Sign Message with Wallet
          </button>
        </div>
      )}

      {/* ── Error display ──────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "var(--red, #f04848)",
            background: "rgba(240,72,72,.08)",
            border: "1px solid rgba(240,72,72,.2)",
            borderRadius: 8,
            padding: "8px 12px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
