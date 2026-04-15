"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useLoginWithOAuth,
  useLoginWithSiwe,
  usePrivy,
} from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useENSName } from "@/hooks/getPrimaryName";
import { getAddress } from "viem";

type Step = 1 | 2 | 3 | 4 | 5;
type SocialProvider = "google" | "twitter";
type WalletProvider = "MetaMask" | "WalletConnect" | "Phantom";
const PENDING_SOCIAL_OAUTH_KEY = "nexid_gateway_pending_social_oauth";
const PENDING_WALLET_AUTH_KEY = "nexid_gateway_pending_wallet_auth";
const PENDING_WALLET_AUTH_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_WALLET_RESUME_ATTEMPTS = 2;

type PendingWalletAuthIntent = {
  provider: WalletProvider;
  startedAt: number;
  resumeAttempts: number;
};

const isWalletProvider = (value: unknown): value is WalletProvider =>
  value === "MetaMask" || value === "WalletConnect" || value === "Phantom";

export default function AcademyGatewayPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [providerName, setProviderName] = useState("MetaMask");
  const [address, setAddress] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [networkStatus, setNetworkStatus] = useState<"disconnected" | "syncing" | "connected">("disconnected");
  const [redirectCount, setRedirectCount] = useState(3);
  const [error, setError] = useState("");
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialPendingSession, setSocialPendingSession] = useState(false);
  const [socialAuthInFlight, setSocialAuthInFlight] = useState(false);
  const { ready: privyReady, authenticated, logout, login, getAccessToken } = usePrivy();
  const { generateSiweMessage, loginWithSiwe } = useLoginWithSiwe();
  const authFlowRef = useRef<"none" | "social" | "wallet">("none");
  const socialAuthRequestedRef = useRef(false);
  const { name: domainName } = useENSName({ owner: (address || "0x0000000000000000000000000000000000000000") as `0x${string}` });

  const hasPendingSocialOAuthIntent = () => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(PENDING_SOCIAL_OAUTH_KEY) === "true";
  };

  const setPendingSocialOAuthIntent = () => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(PENDING_SOCIAL_OAUTH_KEY, "true");
  };

  const clearPendingSocialOAuthIntent = () => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(PENDING_SOCIAL_OAUTH_KEY);
  };

  const getPendingWalletAuthIntent = (): PendingWalletAuthIntent | null => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(PENDING_WALLET_AUTH_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<PendingWalletAuthIntent>;
      if (!isWalletProvider(parsed.provider)) {
        sessionStorage.removeItem(PENDING_WALLET_AUTH_KEY);
        return null;
      }
      const startedAt =
        typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt)
          ? parsed.startedAt
          : 0;
      const resumeAttempts =
        typeof parsed.resumeAttempts === "number" && Number.isFinite(parsed.resumeAttempts)
          ? parsed.resumeAttempts
          : 0;
      if (!startedAt || Date.now() - startedAt > PENDING_WALLET_AUTH_MAX_AGE_MS) {
        sessionStorage.removeItem(PENDING_WALLET_AUTH_KEY);
        return null;
      }
      return {
        provider: parsed.provider,
        startedAt,
        resumeAttempts,
      };
    } catch {
      sessionStorage.removeItem(PENDING_WALLET_AUTH_KEY);
      return null;
    }
  };

  const setPendingWalletAuthIntent = (
    provider: WalletProvider,
    resumeAttempts = 0,
    startedAt = Date.now(),
  ) => {
    if (typeof window === "undefined") return;
    const payload: PendingWalletAuthIntent = {
      provider,
      startedAt,
      resumeAttempts,
    };
    sessionStorage.setItem(PENDING_WALLET_AUTH_KEY, JSON.stringify(payload));
  };

  const clearPendingWalletAuthIntent = () => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(PENDING_WALLET_AUTH_KEY);
  };

  const completeGatewayAuth = useCallback((walletAddress?: string) => {
    localStorage.setItem("nexid_gateway_connected", "true");
    if (walletAddress) {
      localStorage.setItem("nexid_gateway_address", walletAddress);
    }
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(PENDING_WALLET_AUTH_KEY);
    }
    window.dispatchEvent(new Event("nexid-auth-changed"));
    setStep(5);
    setRedirectCount(3);
  }, []);

  // Exchange the current Privy access token for a NexAcademy JWT.
  // Requires the Privy session to already be established (e.g., via
  // loginWithSiwe for external wallets or OAuth login for socials).
  // Retries transient wallet-indexing races where Privy has authenticated
  // the user but hasn't yet propagated the linked/embedded wallet.
  const mintAcademySessionFromPrivy = useCallback(async (
    walletAddress?: string,
  ) => {
    const maxAttempts = 5;
    const retryDelayMs = 800;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const privyAccessToken = await getAccessToken();
      if (!privyAccessToken) {
        throw new Error("Privy session missing — cannot mint Academy session.");
      }

      const verifyRes = await fetch("/api/auth/privy-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privyAccessToken,
          ...(walletAddress ? { walletAddress } : {}),
        }),
      });
      const verifyBody = await verifyRes.json().catch(() => null);

      if (verifyRes.ok) {
        const token = String(verifyBody?.token ?? "");
        if (!token) {
          throw new Error("Academy session response missing token.");
        }
        localStorage.setItem("auth_token", token);
        localStorage.setItem("auth_user", JSON.stringify(verifyBody?.user ?? {}));
        return { token, user: verifyBody?.user ?? null };
      }

      const errMsg: string = verifyBody?.error ?? "Academy session could not be issued.";
      const isWalletRace =
        verifyRes.status === 403 && /wallet/i.test(errMsg) && attempt < maxAttempts;
      if (!isWalletRace) {
        throw new Error(errMsg);
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    throw new Error("Academy session could not be issued.");
  }, [getAccessToken]);

  const resetSocialAuthState = useCallback(() => {
    setSocialLoading(false);
    setSocialPendingSession(false);
    setSocialAuthInFlight(false);
    socialAuthRequestedRef.current = false;
    clearPendingSocialOAuthIntent();
    if (authFlowRef.current === "social") {
      authFlowRef.current = "none";
    }
  }, []);

  const { initOAuth } = useLoginWithOAuth({
    onComplete: () => {
      const hasPendingSocialIntent =
        socialAuthRequestedRef.current || hasPendingSocialOAuthIntent();
      if (!hasPendingSocialIntent) {
        return;
      }
      authFlowRef.current = "social";
      socialAuthRequestedRef.current = true;

      const token = localStorage.getItem("auth_token");
      if (token) {
        resetSocialAuthState();
        completeGatewayAuth();
        return;
      }
      setSocialPendingSession(true);
    },
    onError: (error) => {
      const hasPendingSocialIntent =
        socialAuthRequestedRef.current || hasPendingSocialOAuthIntent();
      if (!hasPendingSocialIntent) {
        return;
      }
      authFlowRef.current = "social";
      socialAuthRequestedRef.current = true;

      setError(String(error) || "Social login failed.");
      resetSocialAuthState();
    },
  });

  const displayName = useMemo(() => {
    if (domainName && typeof domainName === "string" && domainName.length > 0) return domainName;
    if (address) return `${address.slice(0, 6)}...${address.slice(-4)}`;
    return "";
  }, [domainName, address]);

  const orbClass = useMemo(() => {
    if (networkStatus === "syncing") return "orb-gold";
    if (networkStatus === "connected") return "orb-green";
    return "orb-blue";
  }, [networkStatus]);

  const socialSessionFinalizing =
    socialLoading
    || socialPendingSession
    || socialAuthInFlight
    || (privyReady && authenticated && hasPendingSocialOAuthIntent());

  const addLog = (line: string) => {
    setLogs((prev) => [...prev, line]);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  useEffect(() => {
    if (!socialPendingSession || socialAuthInFlight) return;
    if (!socialAuthRequestedRef.current || authFlowRef.current !== "social") return;
    if (!privyReady || !authenticated) return;

    setSocialAuthInFlight(true);

    void (async () => {
      try {
        // The Privy session is already established by the OAuth flow. Exchange
        // its access token for our backend JWT. The server will pick the
        // user's linked ethereum wallet (embedded or external) automatically.
        const { user: academyUser } = await mintAcademySessionFromPrivy();

        const resolvedAddress =
          academyUser && typeof academyUser === "object" && "walletAddress" in academyUser
            ? String((academyUser as { walletAddress?: string }).walletAddress ?? "")
            : "";

        if (resolvedAddress) {
          const checksummed = getAddress(resolvedAddress);
          setAddress((prev) => prev || checksummed);
          completeGatewayAuth(checksummed);
        } else {
          completeGatewayAuth();
        }
      } catch (e) {
        const message = e instanceof Error
          ? e.message
          : "Social login succeeded, but no Academy auth session was issued. Please connect wallet.";
        setError(message);
        localStorage.removeItem("nexid_gateway_connected");
        setStep(1);
      } finally {
        resetSocialAuthState();
      }
    })();
  }, [
    authenticated,
    completeGatewayAuth,
    mintAcademySessionFromPrivy,
    privyReady,
    resetSocialAuthState,
    socialAuthInFlight,
    socialPendingSession,
  ]);

  const beginSocialLogin = async (provider: SocialProvider) => {
    authFlowRef.current = "social";
    socialAuthRequestedRef.current = true;
    clearPendingWalletAuthIntent();
    setPendingSocialOAuthIntent();
    setSocialLoading(true);
    setError("");
    setSocialPendingSession(false);
    setSocialAuthInFlight(false);

    try {
      await initOAuth({ provider });
    } catch (oauthError) {
      const message = oauthError instanceof Error ? oauthError.message : String(oauthError);

      // Headless OAuth init can return 400 for some dashboard/provider configs.
      // Fall back to Privy's modal login for the selected provider.
      if (/unable to init|oauth\/init|headless oauth/i.test(message)) {
        setSocialLoading(false);
        login({ loginMethods: [provider] });
        setSocialPendingSession(true);
        return;
      }

      setError(message || "Social login failed.");
      resetSocialAuthState();
    }
  };

  const connectWithProvider = async (
    provider: WalletProvider,
    options?: { resume?: boolean },
  ) => {
    const isResume = options?.resume === true;
    setProviderName(provider);
    setError("");
    setLogs([]);
    setStep(2);
    setNetworkStatus("syncing");
    authFlowRef.current = "wallet";
    socialAuthRequestedRef.current = false;
    clearPendingSocialOAuthIntent();
    setSocialLoading(false);
    setSocialPendingSession(false);
    setSocialAuthInFlight(false);
    if (!isResume) {
      setPendingWalletAuthIntent(provider);
    }

    try {
      if (authenticated) {
        addLog("[AUTH] Clearing previous social session...");
        await logout();
        await sleep(150);
      }

      const ethereum = (window as {
        ethereum?: {
          request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
        };
      }).ethereum;

      if (!ethereum) {
        throw new Error("No injected wallet detected in this browser.");
      }

      addLog(`[AUTH] Initializing ${provider} provider...`);
      await sleep(300);

      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const rawAddress = accounts?.[0];
      if (!rawAddress) {
        throw new Error("Wallet connection was not approved.");
      }
      const connectedAddress = getAddress(rawAddress);
      setAddress(connectedAddress);
      addLog(`[WALLET] Connected ${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}.`);
      await sleep(250);

      const chainHex = (await ethereum.request({
        method: "eth_chainId",
      })) as string;
      const chainId = Number.parseInt(chainHex, 16);
      addLog(`[RPC] Network chainId ${chainId}.`);
      await sleep(250);

      // Build an EIP-4361 SIWE message via Privy. A single signature will
      // establish both the Privy session (for linkTwitter etc.) and mint our
      // Academy JWT server-side via /api/auth/privy-verify.
      const siweChainId: `eip155:${number}` = `eip155:${Number.isFinite(chainId) && chainId > 0 ? chainId : 8453}`;
      const siweMessage = await generateSiweMessage({
        address: connectedAddress,
        chainId: siweChainId,
      });
      addLog("[PRIVY] SIWE message generated.");
      await sleep(150);

      let signature: string;
      try {
        signature = (await ethereum.request({
          method: "personal_sign",
          params: [siweMessage, connectedAddress],
        })) as string;
      } catch (err) {
        const code = (err as { code?: number })?.code;
        if (code === 4001) {
          throw new Error("Signature rejected by wallet.");
        }
        throw err;
      }
      addLog("[WALLET] Signature received.");
      await sleep(200);

      const walletClientType = provider === "MetaMask"
        ? "metamask"
        : provider === "Phantom"
          ? "phantom"
          : "wallet_connect";
      const connectorType = provider === "WalletConnect" ? "wallet_connect_v2" : "injected";

      await loginWithSiwe({
        signature,
        message: siweMessage,
        walletClientType,
        connectorType,
      });
      addLog("[PRIVY] Session established.");
      await sleep(200);

      await mintAcademySessionFromPrivy(connectedAddress);
      localStorage.setItem("nexid_gateway_connected", "true");
      localStorage.setItem("nexid_gateway_address", connectedAddress);
      window.dispatchEvent(new Event("nexid-auth-changed"));

      addLog("[SUCCESS] Identity resolved.");
      setNetworkStatus("connected");
      await sleep(400);
      clearPendingWalletAuthIntent();
      authFlowRef.current = "none";
      setStep(3);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to connect wallet.";
      setError(message);
      setStep(1);
      setNetworkStatus("disconnected");
      clearPendingWalletAuthIntent();
      authFlowRef.current = "none";
    }
  };

  const resumePendingWalletAuth = useCallback(() => {
    const pendingIntent = getPendingWalletAuthIntent();
    if (!pendingIntent) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    const token = localStorage.getItem("auth_token");
    if (token) {
      clearPendingWalletAuthIntent();
      completeGatewayAuth();
      return;
    }

    if (pendingIntent.resumeAttempts >= MAX_WALLET_RESUME_ATTEMPTS) {
      clearPendingWalletAuthIntent();
      return;
    }

    if (authFlowRef.current !== "none") {
      return;
    }

    setPendingWalletAuthIntent(
      pendingIntent.provider,
      pendingIntent.resumeAttempts + 1,
      pendingIntent.startedAt,
    );
    void connectWithProvider(pendingIntent.provider, { resume: true });
  }, [
    clearPendingWalletAuthIntent,
    completeGatewayAuth,
    connectWithProvider,
    getPendingWalletAuthIntent,
    setPendingWalletAuthIntent,
  ]);

  useEffect(() => {
    const handleResume = () => {
      resumePendingWalletAuth();
    };

    handleResume();
    window.addEventListener("pageshow", handleResume);
    document.addEventListener("visibilitychange", handleResume);

    return () => {
      window.removeEventListener("pageshow", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [resumePendingWalletAuth]);

  const executeSignature = async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setError("Session token missing. Please reconnect your wallet.");
      setStep(1);
      return;
    }
    setStep(5);
    setRedirectCount(3);
    localStorage.setItem("nexid_gateway_connected", "true");
    if (address) localStorage.setItem("nexid_gateway_address", address);
    window.dispatchEvent(new Event("nexid-auth-changed"));
  };

  useEffect(() => {
    if (step !== 5) return;

    const interval = setInterval(() => {
      setRedirectCount((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          router.push("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [router, step]);

  return (
    <div className="nexid-gateway relative flex h-screen items-center justify-center overflow-hidden">
      <div className="bg-grid" />
      <div className={`hero-orb ${orbClass}`} />

      <div className="gateway-panel">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="logo-mark font-display text-lg font-black tracking-tighter text-white"
        >
          N<span className="text-nexid-gold">.</span>
        </button>

        <div className="absolute right-6 top-6 z-20 flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest">
          <span
            className={`h-1.5 w-1.5 rounded-full ${networkStatus === "connected"
              ? "bg-green-500"
              : networkStatus === "syncing"
                ? "bg-nexid-gold animate-pulse"
                : "bg-[#444]"
              }`}
          />
          <span className={networkStatus === "connected" ? "text-green-400" : networkStatus === "syncing" ? "text-nexid-gold" : "text-nexid-muted"}>
            {networkStatus === "connected" ? "Connected" : networkStatus === "syncing" ? "Syncing RPC..." : "Disconnected"}
          </span>
        </div>

        <StepWrap active={step === 1}>
          <div className="mt-4 text-center">
            <h2 className="font-display mb-2 text-2xl font-bold text-white">
              Initialize Session
            </h2>
            <p className="text-sm text-nexid-muted">
              Connect your provider to access the Interactive Knowledge Layer.
            </p>
          </div>

          {/* Social Logins */}
          <div className="mt-8 space-y-3">
            <button
              type="button"
              disabled={socialSessionFinalizing}
              onClick={() => {
                void beginSocialLogin("google");
              }}
              className="social-btn w-full rounded-xl border border-[#222] bg-[#0a0a0a] p-4 text-left text-white flex items-center gap-3"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.07l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span className="font-medium">Continue with Google</span>
            </button>

            <button
              type="button"
              disabled={socialSessionFinalizing}
              onClick={() => {
                void beginSocialLogin("twitter");
              }}
              className="social-btn w-full rounded-xl border border-[#222] bg-[#0a0a0a] p-4 text-left text-white flex items-center gap-3"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="white">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="font-medium">Continue with X</span>
            </button>
          </div>

          {socialSessionFinalizing ? (
            <div className="mt-4 rounded-lg border border-nexid-gold/30 bg-nexid-gold/10 p-3 text-left">
              <p className="font-mono text-[10px] uppercase tracking-widest text-nexid-gold">
                Social session detected
              </p>
              <p className="mt-1 text-xs text-white/85">
                Finalizing login and preparing your signature prompt...
              </p>
            </div>
          ) : null}

          {/* Divider */}
          <div className="gateway-divider my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-[#222]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-nexid-muted">or connect wallet</span>
            <div className="h-px flex-1 bg-[#222]" />
          </div>

          {/* Wallet Buttons with Icons */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => connectWithProvider("MetaMask")}
              className="wallet-btn w-full rounded-xl border border-[#222] bg-[#0a0a0a] p-4 text-left text-white flex items-center gap-3"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 35 33">
                <path fill="#E17726" d="M32.96 1l-13.14 9.72 2.45-5.73z" />
                <path fill="#E27625" d="M2.66 1l13.02 9.8L13.35 5zM28.23 23.53l-3.5 5.34 7.49 2.06 2.14-7.28zM.67 23.65l2.13 7.28 7.47-2.06-3.48-5.34z" />
                <path fill="#E27625" d="M9.93 14.42l-2.07 3.14 7.4.34-.26-7.96zM25.69 14.42l-5.17-4.56-.17 8.04 7.39-.34zM10.27 28.87l4.47-2.16-3.86-3.01zM20.88 26.71l4.46 2.16-.6-5.17z" />
                <path fill="#D5BFB2" d="M25.34 28.87l-4.46-2.16.36 2.93-.04 1.23zM10.27 28.87l4.15 2 -.03-1.23.34-2.93z" />
                <path fill="#233447" d="M14.52 21.76l-3.72-1.09 2.62-1.2zM21.1 21.76l1.1-2.29 2.63 1.2z" />
                <path fill="#CD6116" d="M10.27 28.87l.65-5.34-4.13.12zM24.7 23.53l.64 5.34 3.49-5.22zM27.76 17.56l-7.39.34.69 3.86 1.1-2.29 2.63 1.2zM11.8 20.67l2.62-1.2 1.1 2.29.68-3.86-7.39-.34z" />
                <path fill="#E27525" d="M7.81 17.56l3.12 6.08-.1-3.01zM24.73 20.63l-.12 3.01 3.14-6.08zM15.2 17.9l-.69 3.86.86 4.47.19-5.89zM20.37 17.9L19.45 20.34l.18 5.89.87-4.47z" />
                <path fill="#F5841F" d="M21.06 21.76l-.87 4.47.62.44 3.86-3.01.12-3.01zM11.8 20.65l.1 3.01 3.86 3.01.62-.44-.86-4.47z" />
                <path fill="#C0AC9D" d="M21.12 30.87l.04-1.23-.34-.29h-5.02l-.32.29.03 1.23-4.15-2 1.45 1.19 2.95 2.04h5.1l2.96-2.04 1.44-1.19z" />
                <path fill="#161616" d="M20.88 26.71l-.62-.44h-3.91l-.62.44-.34 2.93.32-.29h5.02l.34.29z" />
                <path fill="#763E1A" d="M33.52 11.35l1.1-5.36L32.96 1l-12.08 8.97 4.65 3.93 6.57 1.92 1.45-1.7-.63-.46 1.01-.92-.78-.6 1.01-.77z" />
                <path fill="#763E1A" d="M.01 5.99l1.11 5.36-.71.53 1.01.77-.77.6 1.01.92-.64.46 1.45 1.7 6.57-1.92 4.65-3.93L2.66 1z" />
                <path fill="#F5841F" d="M32.05 16.86l-6.57-1.92 1.98 3.14-3.14 6.08 4.14-.05h6.18zM9.93 14.94l-6.57 1.92-2.19 6.79h6.17l4.14.05-3.12-6.08z" />
                <path fill="#F5841F" d="M20.37 17.9l.42-7.23 1.91-5.17H12.91l1.91 5.17.42 7.23.16 2.45.01 5.88h3.91l.02-5.88z" />
              </svg>
              <span className="font-medium">MetaMask</span>
            </button>

            <button
              type="button"
              onClick={() => connectWithProvider("WalletConnect")}
              className="wallet-btn w-full rounded-xl border border-[#222] bg-[#0a0a0a] p-4 text-left text-white flex items-center gap-3"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 400 400" fill="none">
                <path d="M122.52 127.57c42.95-42.07 112.57-42.07 155.52 0l5.17 5.06a5.3 5.3 0 0 1 0 7.63l-17.68 17.32a2.8 2.8 0 0 1-3.89 0l-7.11-6.97c-29.97-29.36-78.56-29.36-108.53 0l-7.62 7.46a2.8 2.8 0 0 1-3.89 0l-17.68-17.32a5.3 5.3 0 0 1 0-7.63zm192.04 35.75 15.73 15.42a5.3 5.3 0 0 1 0 7.63l-70.89 69.46a5.59 5.59 0 0 1-7.78 0l-50.3-49.29a1.4 1.4 0 0 0-1.94 0l-50.3 49.29a5.59 5.59 0 0 1-7.78 0l-70.89-69.46a5.3 5.3 0 0 1 0-7.63l15.73-15.42a5.59 5.59 0 0 1 7.78 0l50.3 49.29a1.4 1.4 0 0 0 1.94 0l50.3-49.29a5.59 5.59 0 0 1 7.78 0l50.3 49.29a1.4 1.4 0 0 0 1.94 0l50.3-49.29a5.59 5.59 0 0 1 7.78 0z" fill="#3B99FC" />
              </svg>
              <span className="font-medium">WalletConnect</span>
            </button>

            <button
              type="button"
              onClick={() => connectWithProvider("Phantom")}
              className="wallet-btn w-full rounded-xl border border-[#222] bg-[#0a0a0a] p-4 text-left text-white flex items-center gap-3"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 128 128">
                <defs>
                  <linearGradient id="phantom-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#534BB1" />
                    <stop offset="100%" stopColor="#551BF9" />
                  </linearGradient>
                </defs>
                <rect width="128" height="128" rx="26" fill="url(#phantom-grad)" />
                <path d="M110.58 64.14c-1.21 14.6-13.55 26.18-27.59 26.18h-2.36c-1.36 0-2.45-1.15-2.37-2.52.36-6.07.14-14.32-3.86-19.55-4.38-5.73-11.86-5.8-17.45-3.32-5.14 2.27-8.73 6.55-10.55 11.91-.5 1.47-.77 3-.86 4.55-.04.67-.36 1.29-.88 1.72a2.4 2.4 0 0 1-1.87.55c-8.85-1.09-18.12-5.14-20.68-18.73C19.64 48.73 33.73 27 53.36 27h21.28c20.09 0 37.14 16.41 35.94 37.14zM45.73 56.73a4.36 4.36 0 1 0 0-8.73 4.36 4.36 0 0 0 0 8.73zm18.18 0a4.36 4.36 0 1 0 0-8.73 4.36 4.36 0 0 0 0 8.73z" fill="white" />
              </svg>
              <span className="font-medium">Phantom</span>
            </button>
          </div>

          {error ? (
            <p className="mt-4 text-xs text-red-400">{error}</p>
          ) : null}
        </StepWrap>

        <StepWrap active={step === 2}>
          <div className="flex flex-1 items-center justify-center">
            <div className="relative h-24 w-24">
              <div className="absolute inset-0 animate-[spin_10s_linear_infinite] rounded-full border-2 border-dashed border-nexid-gold/30" />
              <div className="absolute inset-2 animate-[spin_4s_linear_infinite_reverse] rounded-full border-2 border-nexid-gold/50" />
            </div>
          </div>
          <div className="relative h-36 w-full overflow-hidden rounded-lg border border-[#222] bg-[#050505] p-3">
            <div className="custom-scroll h-full overflow-y-auto">
              {logs.map((line, idx) => (
                <div key={`${line}-${idx}`} className="log-line">
                  {line}
                </div>
              ))}
            </div>
          </div>
        </StepWrap>

        <StepWrap active={step === 3}>
          <div className="mt-4 text-center">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10 text-green-400">
              ✓
            </div>
            <h2 className="font-display text-2xl font-bold text-white">
              Identity Resolved
            </h2>
          </div>
          <div className="relative mt-8 rounded-xl border border-nexid-gold/40 bg-[#050505] p-5">
            <div className="mb-3 font-mono text-[9px] uppercase tracking-widest text-nexid-gold">
              Primary Namespace
            </div>
            <div className="font-display text-xl font-bold text-white">
              {displayName}
            </div>
            <div className="font-mono text-[10px] text-nexid-muted">
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
            </div>
          </div>
          <div className="mb-8 mt-6">
            <label className="mb-2 block px-1 font-mono text-[10px] uppercase tracking-widest text-nexid-muted">
              Academy Display Alias (Optional)
            </label>
            <input
              type="text"
              placeholder={displayName ? `Defaults to ${displayName}` : "Enter alias"}
              className="gateway-input"
            />
          </div>
          <button
            type="button"
            onClick={() => setStep(4)}
            className="w-full rounded-xl bg-white py-4 text-sm font-bold text-black"
          >
            Confirm Identity
          </button>
        </StepWrap>

        <StepWrap active={step === 4}>
          <div className="text-center">
            <h2 className="font-display mb-3 text-2xl font-bold text-white">
              Sign Session Key
            </h2>
            <p className="mx-auto mb-8 max-w-xs text-sm leading-relaxed text-nexid-muted">
              Approve a gasless session key to interact with Academy contracts.
            </p>
          </div>
          <div className="mb-8 rounded-lg border border-[#222] bg-[#050505] p-4 text-left">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] text-nexid-muted">Permission</span>
              <span className="font-mono text-[10px] text-green-400">Granted</span>
            </div>
            <div className="break-all font-mono text-xs text-white/80">
              SignMessage: &quot;Authenticate session for {displayName || "wallet"}. Valid for 24h.&quot;
            </div>
          </div>
          <button
            id="sign-btn"
            type="button"
            onClick={executeSignature}
            className="w-full rounded-xl bg-nexid-gold py-4 text-sm font-bold text-black"
          >
            Sign & Enter Protocol
          </button>
        </StepWrap>

        <StepWrap active={step === 5}>
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border-2 border-green-500/20">
              <span className="text-3xl text-green-500">✓</span>
            </div>
            <h2 className="font-display mb-2 text-2xl font-bold text-white">
              Authentication Successful
            </h2>
            <p className="font-mono text-sm text-nexid-muted">
              Routing to Interactive Dashboard in {redirectCount}...
            </p>
          </div>
        </StepWrap>
      </div>
    </div>
  );
}

function StepWrap({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`step-container flex flex-col ${active ? "active" : ""}`}>
      {children}
    </div>
  );
}
