"use client";

import { useEffect, useState } from "react";
import { base } from "wagmi/chains";
import { useSendTransaction, useSwitchChain } from "wagmi";
import { checkIdAvailabilityApi, confirmIdMintApi, fetchDashboardApi, mintIdApi, reserveIdApi } from "@/lib/services/nexid-client";
import { displayReferralUrl } from "@/lib/appBaseUrl";
import { resolvePrimaryDomainName, stripIdSuffix } from "@/lib/identity";
import { cleanReferralCode, REFERRAL_STORAGE_KEY } from "@/lib/referrals";
import type { DashboardSnapshot } from "@/lib/types/nexid";
import { Logo } from "@/components/nexid/shared/logo";
import { WalletChoiceButton, useWalletSession } from "@/components/nexid/shared/wallet-session";
import { cleanIdName, cls } from "@/components/nexid/shared/utils";

type IdQuote = {
  name: string;
  label: string;
  available: boolean;
  price: number | null;
  priceUsdFormatted?: string;
  priceEthFormatted?: string;
};

export function MintPageClient({ appBaseUrl }: { appBaseUrl: string }) {
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState<IdQuote | null>(null);
  const [checking, setChecking] = useState(false);
  const [stage, setStage] = useState<"search" | "pay" | "activating" | "active">("search");
  const [payMethod, setPayMethod] = useState("Wallet");
  const [message, setMessage] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const wallet = useWalletSession(dashboard?.user ?? null);
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();

  useEffect(() => {
    void fetchDashboardApi().then((snapshot) => {
      setDashboard(snapshot);
      wallet.setUser(snapshot.user);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incoming = cleanReferralCode(params.get("ref"));
    const stored = cleanReferralCode(window.localStorage.getItem(REFERRAL_STORAGE_KEY));
    const next = incoming ?? stored;
    if (incoming) window.localStorage.setItem(REFERRAL_STORAGE_KEY, incoming);
    setReferralCode(next);
  }, []);

  const activeUser = wallet.user ?? dashboard?.user ?? null;
  const primaryId = activeUser?.primaryIdName ?? dashboard?.idNames.find((item) => item.isPrimary)?.name ?? "";
  const displayDomain = primaryId ? `${primaryId}.id` : activeUser ? wallet.primaryDomainName ?? resolvePrimaryDomainName(activeUser) ?? "" : "";
  const displayDomainBase = stripIdSuffix(displayDomain);

  useEffect(() => {
    const clean = cleanIdName(draft);
    setQuote(null);
    setStage("search");
    if (!clean) return;
    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(() => {
      void checkIdAvailabilityApi(clean).then((nextQuote) => {
        if (!cancelled) setQuote(nextQuote);
      }).catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message.replace(/NexDomains/gi, ".id") : ".id price check failed.");
      }).finally(() => {
        if (!cancelled) setChecking(false);
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft]);

  const clean = cleanIdName(draft);
  const previewName = clean || "Name";
  const activeReferralUrl = displayDomainBase ? displayReferralUrl(displayDomainBase, appBaseUrl) : "";
  const previewReferralUrl = displayReferralUrl(clean || "name", appBaseUrl);
  const rewardBadge = dashboard?.rewards.badge ?? "Signal Scout";
  const rewardLevel = dashboard?.rewards.level ?? "Scout";
  const quoteMatches = quote?.name === clean;
  const priceLabel = checking ? "Checking" : quoteMatches && quote?.priceUsdFormatted ? quote.priceUsdFormatted : quoteMatches && quote?.price != null ? `$${quote.price.toFixed(2)}` : "-";
  const availabilityLabel = !clean ? "Search a name" : checking ? "Checking NexDomains" : quoteMatches ? quote?.available ? "Available" : "Unavailable" : "Price unavailable";
  const canProceed = Boolean(clean && quoteMatches && quote?.available && quote.price != null);

  async function reserve() {
    try {
      await wallet.ensureSignedIn();
      if (!canProceed) throw new Error("That name is not available with a confirmed price yet.");
      await reserveIdApi(clean);
      setStage("pay");
      setMessage(`${clean}.id reserved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ".id reservation failed.");
    }
  }

  async function mint() {
    try {
      await wallet.ensureSignedIn();
      setStage("activating");
      const prepared = await mintIdApi(clean, payMethod, referralCode);
      if (!prepared.transaction) throw new Error(prepared.message?.replace(/NexDomains/gi, ".id") || "Registration is not ready yet.");
      if (prepared.referral?.message && !prepared.referral.active) {
        setMessage(`Referral not applied: ${prepared.referral.message}`);
      }
      await switchChainAsync({ chainId: prepared.transaction.chainId || base.id }).catch(() => undefined);
      const txHash = await sendTransactionAsync({
        to: prepared.transaction.to,
        data: prepared.transaction.data,
        value: BigInt(prepared.transaction.value || "0")
      });
      const activated = await confirmIdMintApi(clean, payMethod, txHash, prepared.referral?.active ? prepared.referral.code : null);
      setMessage(`${activated.label} is live.`);
      setStage("active");
    } catch (error) {
      setStage("pay");
      setMessage(error instanceof Error ? error.message : ".id mint failed.");
    }
  }

  if (displayDomain) {
    return (
      <section id="mint" className="view active">
        <div className="mint-elite minted-mode">
          <aside className="mint-passport-card"><div className="mint-passport-top"><div className="rc-logo"><Logo /> NexID</div><span className="mint-passport-tag">Active</span></div><div className="mint-passport-body"><h2 className="mint-name-preview">{displayDomainBase}<span className="muted-dot">.id</span></h2><p>Your edge passport is live. Receipts, board identity, referral trail and reward eligibility now carry this name.</p></div><div className="mint-passport-bottom"><div className="mint-ref-preview"><div><span>Referral link</span><b>{activeReferralUrl}</b></div><strong>{rewardLevel}</strong></div></div></aside>
          <section className="minted-success"><div className="rc-logo"><Logo /> NexID</div><h2>{displayDomain} is yours.</h2><p>Your portable edge passport is active. Current reward badge: {rewardBadge}. Weekly rewards require active .id ownership at payout review.</p></section>
        </div>
      </section>
    );
  }

  return (
    <section id="mint" className="view active">
      <div className="mint-elite">
        <aside className="mint-passport-card"><div className="mint-passport-top"><div className="rc-logo"><Logo /> NexID</div><span className="mint-passport-tag">Edge Passport</span></div><div className="mint-passport-body"><h2 className="mint-name-preview">{previewName}<span className="muted-dot">.id</span></h2><p>Receipts, ranks, referrals and weekly reward eligibility become easier to carry when they have a name.</p><div className="mint-proof-strip"><div className="mint-proof"><span>Receipts</span><b>Verified</b></div><div className="mint-proof"><span>Rewards</span><b>Eligible</b></div><div className="mint-proof"><span>Referral</span><b>25%</b></div></div></div><div className="mint-passport-bottom"><div className="mint-ref-preview"><div><span>Card footer</span><b>{previewReferralUrl}</b></div><strong>{priceLabel}</strong></div></div></aside>
        <section className="mint-console">
          <div className="mint-console-inner">
            <div className="eyebrow"><i className="dot" /> Mint .id</div>
            <h2>Own the name that carries your edge</h2>
            <p className="lead">Live pricing and availability are checked before you reserve.</p>
            <div className="mint-progress">{["Name", "Reserve", "Pay", "Active"].map((step, index) => <div className={cls("mint-step", index === 0 || stage !== "search" && index <= 2 ? "active" : "")} key={step}>{step}</div>)}</div>
            <div className="mint-name-field"><input value={draft} onChange={(event) => setDraft(cleanIdName(event.target.value))} placeholder="edge" autoComplete="off" spellCheck={false} /><span>.id</span></div>
            <div className="mint-live-price"><div><h3>{clean ? `${clean}.id` : "Claim your edge passport"}</h3><p>{availabilityLabel}{quoteMatches && quote?.priceEthFormatted ? ` - ${quote.priceEthFormatted} ETH` : ""}</p></div><div className="price">{priceLabel}{quoteMatches && quote?.price != null ? <small> USD</small> : null}</div></div>
            {referralCode ? <div className="wallet-note">Referral applied: {referralCode}.id</div> : null}
            {stage === "pay" ? <><div className="payment-title"><h3>Select how to pay</h3><span>Confirm once. Activate immediately after payment.</span></div><div className="pay-grid elite">{["Wallet", "USDC", "USDT"].map((method) => <button className={cls("pay-card elite", payMethod === method && "active")} key={method} onClick={() => setPayMethod(method)}><b>{method}</b><span>{method === "Wallet" ? "Use available balance" : "Stable payment"}</span></button>)}</div></> : null}
            <div className="mint-primary-row">{stage === "pay" || stage === "activating" ? <button className="primary" onClick={mint} disabled={stage === "activating"}>{stage === "activating" ? "Activating" : "Confirm in wallet"}</button> : wallet.user ? <button className="primary" disabled={!canProceed} onClick={reserve}>{canProceed ? `Proceed to own ${clean}.id` : availabilityLabel}</button> : <WalletChoiceButton authenticated={false} onSign={() => void wallet.ensureSignedIn().catch((error) => setMessage(error.message))} onDisconnect={wallet.disconnect} />}</div>
            {message ? <div className="wallet-note">{message}</div> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
