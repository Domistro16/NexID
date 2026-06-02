"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { base } from "wagmi/chains";
import { useSendTransaction, useSwitchChain } from "wagmi";
import { checkIdAvailabilityApi, confirmIdMintApi, fetchDashboardApi, mintIdApi, reserveIdApi } from "@/lib/services/nexid-client";
import { displayReferralUrl } from "@/lib/appBaseUrl";
import { resolvePrimaryDomainName, stripIdSuffix } from "@/lib/identity";
import { cleanReferralCode, REFERRAL_STORAGE_KEY } from "@/lib/referrals";
import type { DashboardSnapshot } from "@/lib/types/nexid";
import { useWalletSession } from "@/components/nexid/shared/wallet-session";
import { cleanIdName, cls } from "@/components/nexid/shared/utils";

type IdQuote = {
  name: string;
  label: string;
  available: boolean;
  price: number | null;
  priceUsdFormatted?: string;
  priceEthFormatted?: string;
};

type MintStage = "search" | "reserve" | "activating" | "active";
type PayMode = "wallet" | "referral" | "edge" | "auto";

const suggestions = ["alpha", "signal", "kamli", "edgecaller"] as const;

function money(value: number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function paymentLabel(mode: PayMode) {
  if (mode === "referral") return "Referral earnings";
  if (mode === "edge") return "EdgeBoard rewards";
  if (mode === "auto") return "Auto split";
  return "Wallet";
}

function fitMintNames() {
  document.querySelectorAll<HTMLElement>(".v35-passport-name,.mint-name-preview").forEach((el) => {
    const text = el.textContent?.replace(/\s+/g, " ").trim() || "yourname.id";
    const parentWidth = el.parentElement?.getBoundingClientRect().width || el.getBoundingClientRect().width || 320;
    const size = window.innerWidth <= 720
      ? Math.min(48, Math.max(27, Math.floor((parentWidth * 1.7) / Math.max(text.length, 8))))
      : Math.min(76, Math.max(28, Math.floor((parentWidth * 1.72) / Math.max(text.length, 8))));
    el.style.fontSize = `${size}px`;
    el.style.lineHeight = "1.1";
    el.style.paddingBottom = "0.18em";
    el.style.whiteSpace = "nowrap";
    el.style.overflow = "visible";
    el.style.textOverflow = "clip";
    el.style.letterSpacing = text.length > 14 ? "-.035em" : text.length > 10 ? "-.055em" : "-.075em";
  });
}

export function MintPageClient({ appBaseUrl }: { appBaseUrl: string }) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [quote, setQuote] = useState<IdQuote | null>(null);
  const [checking, setChecking] = useState(false);
  const [stage, setStage] = useState<MintStage>("search");
  const [payMode, setPayMode] = useState<PayMode>("wallet");
  const [message, setMessage] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [showExistingId, setShowExistingId] = useState(true);
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

  useEffect(() => {
    const clean = cleanIdName(draft);
    setQuote(null);
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

  const activeUser = wallet.user ?? dashboard?.user ?? null;
  const primaryId = activeUser?.primaryIdName ?? dashboard?.idNames.find((item) => item.isPrimary)?.name ?? "";
  const displayDomain = primaryId ? `${primaryId}.id` : activeUser ? wallet.primaryDomainName ?? resolvePrimaryDomainName(activeUser) ?? "" : "";
  const displayDomainBase = stripIdSuffix(displayDomain);
  const clean = cleanIdName(draft);
  const quoteMatches = quote?.name === clean;
  const selectedQuoteMatches = selectedName ? quote?.name === selectedName : quoteMatches;
  const price = selectedQuoteMatches && quote?.price != null ? quote.price : quoteMatches && quote?.price != null ? quote.price : null;
  const priceLabel = checking && !selectedName ? "Checking" : quote?.priceUsdFormatted && (quoteMatches || selectedQuoteMatches) ? quote.priceUsdFormatted : price != null ? money(price) : "-";
  const completedName = stage === "active" ? selectedName : showExistingId ? displayDomainBase : "";
  const completed = Boolean(completedName);
  const activeName = completedName || selectedName || clean || displayDomainBase || "yourname";
  const referralPreview = displayReferralUrl(activeName, appBaseUrl);
  const receiptCount = dashboard?.receipts.length ?? 0;
  const launchedCount = dashboard?.receipts.filter((receipt) => receipt.side === "launch").length ?? 0;
  const rewardsBalance = (dashboard?.referralStats.pending ?? 0) + (dashboard?.rewards.pendingUsd ?? 0);
  const referralBalance = dashboard?.referralStats.pending ?? 0;
  const edgeBalance = dashboard?.rewards.pendingUsd ?? 0;
  const canReserve = Boolean(clean && quoteMatches && quote?.available && quote.price != null && !selectedName);
  const canConfirm = Boolean(selectedName && stage === "reserve");

  const availability = useMemo(() => {
    if (!clean) {
      return {
        status: "wait",
        pill: "Checking",
        title: "Type a name to check availability",
        detail: "Availability and price update as you type. The input stays focused."
      };
    }
    if (checking || !quoteMatches) {
      return {
        status: "wait",
        pill: "Checking",
        title: `Checking ${clean}.id`,
        detail: "Live availability and price are being checked."
      };
    }
    if (!quote?.available) {
      return {
        status: "bad",
        pill: "Unavailable",
        title: `${clean}.id is taken`,
        detail: "Try a variation or choose one of the suggestions below."
      };
    }
    return {
      status: "ok",
      pill: "Available",
      title: `${clean}.id is available`,
      detail: quote.priceEthFormatted
        ? `Select this name to reserve it before checkout. ${quote.priceEthFormatted} ETH.`
        : "Select this name to reserve it before checkout."
    };
  }, [checking, clean, quote, quoteMatches]);

  useEffect(() => {
    fitMintNames();
    window.addEventListener("resize", fitMintNames);
    return () => window.removeEventListener("resize", fitMintNames);
  }, [activeName, completed, stage]);

  function stepClass(step: "search" | "reserve" | "pay" | "active") {
    const order = ["search", "reserve", "pay", "active"];
    const current = completed ? 3 : stage === "activating" ? 2 : selectedName ? 1 : 0;
    const index = order.indexOf(step);
    return cls("v35-step", index < current && "done", index === current && "active");
  }

  function updateDraft(value: string) {
    setDraft(cleanIdName(value).slice(0, 18));
    setSelectedName("");
    setStage("search");
    setShowExistingId(false);
    setMessage("");
  }

  async function reserve() {
    try {
      await wallet.ensureSignedIn();
      if (!canReserve) throw new Error("That name is not available with a confirmed price yet.");
      await reserveIdApi(clean);
      setSelectedName(clean);
      setStage("reserve");
      setMessage(`${clean}.id reserved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ".id reservation failed.");
    }
  }

  async function confirmMint() {
    try {
      const user = await wallet.ensureSignedIn();
      const name = selectedName || clean;
      if (!name) throw new Error("Select a name before confirming.");
      setStage("activating");
      const prepared = await mintIdApi(name, paymentLabel(payMode), referralCode);
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
      const activated = await confirmIdMintApi(name, paymentLabel(payMode), txHash, prepared.referral?.active ? prepared.referral.code : null);
      setMessage(`${activated.label} is live.`);
      setStage("active");
      setSelectedName(activated.name);
      setDraft(activated.name);
      setShowExistingId(true);
      setDashboard(await fetchDashboardApi().catch(() => dashboard));
      wallet.setUser({ ...user, primaryIdName: activated.name });
    } catch (error) {
      setStage("reserve");
      setMessage(error instanceof Error ? error.message : ".id mint failed.");
    }
  }

  function copyReferral() {
    void navigator.clipboard?.writeText(referralPreview).then(() => setMessage("Referral link copied."));
  }

  function startAnother() {
    setDraft("");
    setSelectedName("");
    setStage("search");
    setShowExistingId(false);
    setMessage("");
  }

  const paymentCards: Array<{ key: PayMode; label: string; amount: number | null; detail: string }> = [
    { key: "wallet", label: "Wallet", amount: price, detail: "Pay fully from wallet" },
    { key: "referral", label: "Referral earnings", amount: referralBalance, detail: "Use referral balance first" },
    { key: "edge", label: "EdgeBoard rewards", amount: edgeBalance, detail: "Use EdgeBoard balance first" },
    { key: "auto", label: "Auto split", amount: price, detail: "Best balance mix" }
  ];

  return (
    <section id="mint" className="view active v35-mint-active">
      <section className="v35-mint-wrap">
        <div className="v35-mint-main">
          <div className="v35-mint-head">
            <div>
              <div className="eyebrow"><i className="dot" /> Mint .id</div>
              <h1>Choose the name that carries your proof.</h1>
              <p>Search, select the available name, then confirm with wallet balance, referral earnings, EdgeBoard rewards or an automatic split.</p>
            </div>
            {completed ? <span className="v35-status-pill ok">Active: {completedName}.id</span> : null}
          </div>

          {stage === "activating" ? (
            <div className="v35-activate">
              <div>
                <div className="v35-orb" />
                <h2>Activating {selectedName}.id</h2>
                <p>Locking the name, confirming the wallet transaction and attaching your passport to receipts, referrals and dashboard.</p>
                <div className="v35-activation-list"><span>Name reservation confirmed</span><span>Payment route prepared</span><span>Updating passport and referral link</span></div>
              </div>
            </div>
          ) : completed ? (
            <div className="v35-success">
              <span className="v35-status-pill ok">Active</span>
              <h2>{completedName}.id is live.</h2>
              <p>Your identity is now attached to receipts, launch records, EdgeBoard status, creator fees and referral rewards. Use it as your public proof layer across NexMarkets.</p>
              <div className="v35-success-grid">
                <div className="v35-success-tile"><span>Referral link</span><b>{referralPreview}</b></div>
                <div className="v35-success-tile"><span>Passport</span><b>Receipts · Rewards · Reputation</b></div>
                <div className="v35-success-tile"><span>Paid with</span><b>{paymentLabel(payMode)}</b></div>
              </div>
              <div className="v35-success-actions"><button className="gold" type="button" onClick={() => router.push("/dashboard")}>Go to dashboard</button><button type="button" onClick={copyReferral}>Copy referral link</button><button type="button" onClick={startAnother}>Mint another</button></div>
            </div>
          ) : (
            <>
              <div className="v35-step-row"><div className={stepClass("search")}>Search <i>1</i></div><div className={stepClass("reserve")}>Reserve <i>2</i></div><div className={stepClass("pay")}>Confirm <i>3</i></div><div className={stepClass("active")}>Active <i>4</i></div></div>
              <div className="v35-name-stage">
                <div className="v35-name-shell"><input value={draft} onChange={(event) => updateDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && canReserve) void reserve(); }} autoComplete="off" spellCheck={false} placeholder="yourname" /><span>.id</span></div>
                <div className="v35-availability">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span className={cls("v35-status-pill", availability.status === "ok" ? "ok" : availability.status === "bad" ? "bad" : "wait")}>{availability.pill}</span><h3>{availability.title}</h3></div>
                    <p>{availability.detail}</p>
                  </div>
                  <div className="v35-price">{priceLabel} <small>USDC</small></div>
                </div>
                <div className="v35-suggestion-row">{suggestions.map((item) => <button key={item} type="button" onClick={() => updateDraft(item)}>{item}.id</button>)}</div>
                {selectedName ? <div className="v35-selected-card"><div><b>{selectedName}.id selected</b><span>Reserved for this checkout. Change it before confirming if needed.</span></div><button type="button" onClick={() => { setSelectedName(""); setStage("search"); }}>Change</button></div> : null}
              </div>

              {selectedName ? (
                <section>
                  <div className="payment-title"><h3>Choose how to pay</h3><span>Wallet, referral earnings, EdgeBoard rewards or auto split</span></div>
                  <div className="v35-payment-grid">{paymentCards.map((card) => <button className={cls("v35-pay-card", payMode === card.key && "active")} key={card.key} type="button" onClick={() => setPayMode(card.key)}><span>{card.label}</span><div><strong>{card.amount == null ? priceLabel : money(card.amount)}</strong><span>{card.detail}</span></div></button>)}</div>
                  <div className="v35-breakdown">
                    <div className="v35-breakdown-row"><span>Name</span><b>{selectedName}.id</b></div>
                    <div className="v35-breakdown-row"><span>Price</span><b>{priceLabel} USDC</b></div>
                    <div className="v35-breakdown-row"><span>Payment route</span><b>{paymentLabel(payMode)}</b></div>
                    <div className="v35-breakdown-row"><span>Status</span><b>{activeUser ? "Ready to confirm" : "Wallet signature required"}</b></div>
                  </div>
                </section>
              ) : null}

              <div className="v35-actions"><button className="primary" disabled={!canReserve} type="button" onClick={() => void reserve()}>Select {clean ? `${clean}.id` : "name"}</button><button className="primary" disabled={!canConfirm} type="button" onClick={() => void confirmMint()}>Confirm mint</button><button className="btn" type="button" onClick={() => router.push("/dashboard")}>Dashboard</button></div>
              {message ? <div className="wallet-note">{message}</div> : null}
            </>
          )}
        </div>

        <aside className="v35-passport-side">
          <div className="v35-passport-top"><span className="v35-passport-chip">NexID Passport</span><span className="v35-passport-chip">Proof layer</span></div>
          <h2 className="v35-passport-name">{activeName}<span className="dotid">.id</span></h2>
          <p>Your .id carries receipts, creator launches, EdgeBoard rank, reward claims, referrals and public reputation across NexMarkets.</p>
          <div className="v35-proof-grid"><div className="v35-proof"><span>Receipts</span><b>{receiptCount}</b></div><div className="v35-proof"><span>Launched</span><b>{launchedCount}</b></div><div className="v35-proof"><span>Rewards</span><b>{money(rewardsBalance)}</b></div></div>
          <div className="v35-ref-box"><div><span>Referral link</span><b>{referralPreview}</b></div><strong>25%</strong></div>
        </aside>
      </section>
    </section>
  );
}
