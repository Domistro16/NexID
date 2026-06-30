"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Address } from "viem";
import { useChainId, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { useWalletSession } from "@/components/nexid/shared/wallet-session";
import { userFacingTransactionError } from "@/lib/client/transaction-error";
import { nativeBinaryMarketAbi } from "@/lib/contracts/nexmarkets";
import type { NexMarket } from "@/lib/types/nexmarkets";

type SettlementPageState =
  | "live"
  | "closed"
  | "auto_source_check"
  | "proposed"
  | "challenged"
  | "additional_review"
  | "finalized"
  | "invalid";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function outcomeLabel(value: unknown) {
  if (value === "ride") return "YES";
  if (value === "fade") return "NO";
  if (value === "invalid") return "INVALID";
  return "Pending";
}

function statusLabel(value: unknown) {
  const status = text(value, "pending");
  return status
    .replace(/^finalized_yes$/, "Finalized YES")
    .replace(/^finalized_no$/, "Finalized NO")
    .replace(/^finalized_invalid$/, "Invalid / Refund")
    .replace(/^challenge_open$/, "Challenge Window Open")
    .replace(/^evidence_review$/, "Evidence Review")
    .replace(/^additional_review$/, "Additional Review")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactDate(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function useNowTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function countdownLabel(value: unknown, nowMs: number) {
  if (typeof value !== "string" || !value) return "-";
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "-";
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - nowMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function sourceLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function modeLabel(value: unknown) {
  const mode = text(value, "evidence_based");
  return mode === "auto_verifiable" ? "Auto-verifiable" : "Evidence-based";
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "$0.00";
}

function bpsNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bpsPercentLabel(value: unknown) {
  const bps = bpsNumber(value);
  if (bps <= 0) return "Pending";
  return `${(bps / 100).toFixed(2)}% Ride`;
}

function twapWindowLabel(value: unknown) {
  const seconds = bpsNumber(value);
  if (seconds <= 0) return "full market weighted average";
  if (seconds >= 6 * 60 * 60) return "6-hour weighted average";
  if (seconds >= 2 * 60 * 60) return "2-hour weighted average";
  return `${Math.max(1, Math.round(seconds / 60))}-minute weighted average`;
}

function challengeWindowLabel(card: Record<string, unknown>, market: NexMarket) {
  if (typeof card.challengeWindowLabel === "string" && card.challengeWindowLabel.trim()) return card.challengeWindowLabel;
  const seconds = typeof card.challengeWindowSeconds === "number" ? card.challengeWindowSeconds : market.challengeWindowSeconds;
  if (typeof seconds === "number" && Number.isFinite(seconds)) return `${Math.round(seconds / 3600)}h`;
  if (market.challengeWindowEndsAt) return `Until ${compactDate(market.challengeWindowEndsAt)}`;
  return "24h";
}

function settlementState(market: NexMarket, proofFlow: Record<string, unknown>, card: Record<string, unknown>): SettlementPageState {
  const marketStatus = market.status;
  const status = text(proofFlow.settlementStatus ?? market.settlementStatus, "draft");
  const finalOutcome = proofFlow.finalOutcome ?? market.finalOutcome;
  const mode = text(proofFlow.settlementMode ?? market.settlementMode ?? card.settlementMode, "evidence_based");
  if (finalOutcome === "invalid" || status === "finalized_invalid" || status === "refunded" || marketStatus === "invalid_refund") return "invalid";
  if (status === "finalized_yes" || status === "finalized_no" || marketStatus === "settled") return "finalized";
  if (status === "additional_review") return "additional_review";
  if (status === "evidence_review" || marketStatus === "disputed") return "challenged";
  if (status === "challenge_open" || status === "provisional" || marketStatus === "result_proposed") return mode === "auto_verifiable" ? "auto_source_check" : "proposed";
  if (marketStatus === "closed" || status === "closed") return mode === "auto_verifiable" ? "auto_source_check" : "closed";
  return "live";
}

const timeline = [
  ["live", "Live"],
  ["closed", "Closed"],
  ["proposed", "Proposed"],
  ["challenged", "Challenged"],
  ["review", "Review"],
  ["resolved", "Resolved"]
] as const;

function activeTimelineKey(state: SettlementPageState) {
  if (state === "auto_source_check" || state === "proposed") return "proposed";
  if (state === "additional_review") return "review";
  if (state === "finalized" || state === "invalid") return "resolved";
  return state;
}

export function SettlementStatusCard({
  market,
  proofFlow,
  card,
  state
}: {
  market: NexMarket;
  proofFlow: Record<string, unknown>;
  card: Record<string, unknown>;
  state: SettlementPageState;
}) {
  return (
    <article className="pf-card pf-status-card">
      <div className="pf-card-top">
        <span>Settlement Status</span>
        <b>{statusLabel(proofFlow.settlementStatus ?? market.settlementStatus ?? state)}</b>
      </div>
      <div className="pf-lines">
        <div><span>Mode</span><b>{modeLabel(proofFlow.settlementMode ?? market.settlementMode ?? card.settlementMode)}</b></div>
        <div><span>Source</span><b>Locked - {sourceLabel(card.primarySource ?? market.sourceUrl)}</b></div>
        <div><span>Challenge window</span><b>{challengeWindowLabel(card, market)}</b></div>
        <div><span>Current state</span><b>{statusLabel(proofFlow.settlementStatus ?? market.settlementStatus ?? state)}</b></div>
      </div>
      <ResolutionCard market={market} card={card} embedded />
    </article>
  );
}

export function ResolutionCard({ market, card, embedded = false }: { market: NexMarket; card: Record<string, unknown>; embedded?: boolean }) {
  return (
    <details className={`${embedded ? "" : "pf-card " }pf-resolution-details`} id="pf-resolution-card">
      <summary>View Resolution Card</summary>
      <div className="pf-lines">
        <div><span>Locked source</span><b>{sourceLabel(card.primarySource ?? market.sourceUrl)}</b></div>
        <div><span>Close time</span><b>{compactDate(card.closeTime ?? market.closeTime)}</b></div>
        <div><span>Resolution time</span><b>{compactDate(card.settlementTime)}</b></div>
        <div><span>Challenge</span><b>{challengeWindowLabel(card, market)}</b></div>
      </div>
      <div className="pf-rules">
        <div><span>YES rule</span><p>{text(card.yesRule ?? market.yesRule, "YES if the locked market condition is proven true.")}</p></div>
        <div><span>NO rule</span><p>{text(card.noRule ?? market.noRule, "NO if the locked market condition is not proven true.")}</p></div>
        <div><span>INVALID rule</span><p>{text(card.invalidRule ?? market.invalidRule, "If locked rules and evidence cannot prove YES or NO, resolve INVALID / REFUND.")}</p></div>
      </div>
    </details>
  );
}

export function SettlementTimeline({ state }: { state: SettlementPageState }) {
  const active = activeTimelineKey(state);
  const activeIndex = timeline.findIndex(([key]) => key === active);
  return (
    <article className="pf-card pf-timeline-card">
      <div className="pf-card-top">
        <span>Settlement Timeline</span>
        <b>{statusLabel(state)}</b>
      </div>
      <div className="pf-timeline" role="list">
        {timeline.map(([key, label], index) => {
          const isActive = active === key;
          const isDone = activeIndex > index;
          return (
          <div
            aria-current={isActive ? "step" : undefined}
            className={`pf-step ${isActive ? "active" : isDone ? "done" : "future"}`}
            key={key}
            role="listitem"
          >
            <i />
            <span>{label}</span>
            <em>{isActive ? "Current" : isDone ? "Done" : "Pending"}</em>
          </div>
          );
        })}
      </div>
    </article>
  );
}

export function MarketSentimentAtCloseCard({
  market,
  proofFlow,
  state
}: {
  market: NexMarket;
  proofFlow: Record<string, unknown>;
  state: SettlementPageState;
}) {
  const showState = state !== "live";
  const marketAddress = market.contractAddress as Address | undefined;
  const chainId = market.chainId ?? undefined;
  const enabled = Boolean(showState && marketAddress && chainId);
  const fallback = asRecord(proofFlow.marketSentimentAtClose);
  const spotQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "closingSpotPrice",
    chainId,
    query: { enabled }
  });
  const twapQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "closingTWAP",
    chainId,
    query: { enabled }
  });
  const windowQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "closingTWAPWindowSeconds",
    chainId,
    query: { enabled }
  });
  const volumeQuery = useReadContract({
    address: marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "collateralPool",
    chainId,
    query: { enabled }
  });

  const spot = bpsNumber(spotQuery.data) || bpsNumber(fallback.spotRideBps);
  const twap = bpsNumber(twapQuery.data) || bpsNumber(fallback.consensusRideBps);
  const windowSeconds = bpsNumber(windowQuery.data) || bpsNumber(fallback.twapWindowSeconds);
  const recordedVolumeUsdc = Number(fallback.volumeUsdc ?? market.nativeStats?.collateralUsdc ?? 0);
  const poolUsdc = typeof volumeQuery.data === "bigint" ? Number(volumeQuery.data) / 1_000_000 : 0;
  const volumeUsdc = recordedVolumeUsdc > 0 ? recordedVolumeUsdc : poolUsdc;

  if (!showState || (!enabled && !fallback.spotRideBps && !fallback.consensusRideBps) || (spot <= 0 && twap <= 0)) return null;

  return (
    <article className="pf-card">
      <div className="pf-card-top">
        <span>Market sentiment at close</span>
        <b>{twap > 0 ? "Weighted average" : "Pending"}</b>
      </div>
      <div className="pf-lines">
        <div><span>Spot price</span><b>{bpsPercentLabel(spot)}</b></div>
        <div><span>Consensus (TWAP)</span><b>{bpsPercentLabel(twap)} - {twapWindowLabel(windowSeconds)}</b></div>
        <div><span>Volume</span><b>{money(volumeUsdc)} total traded</b></div>
      </div>
      <p className="pf-copy">Consensus is a weighted market signal for Provers. It never replaces the locked rules, public evidence, or Prover consensus.</p>
    </article>
  );
}

export function SettlementActionPanel({
  marketId,
  state,
  proofFlow
}: {
  marketId: string;
  state: SettlementPageState;
  proofFlow: Record<string, unknown>;
}) {
  const [outcome, setOutcome] = useState<"ride" | "fade" | "invalid">("ride");
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const now = useNowTick();
  const challengeCountdown = countdownLabel(proofFlow.challengeWindowEndsAt, now);
  const hasResolutionNote = Boolean(asRecord(proofFlow.settlementReceipt).id || proofFlow.finalResolutionNote);

  async function submitSettlementAction(event: FormEvent<HTMLFormElement>, kind: "provisional" | "challenge") {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/markets/${marketId}/proof-flow/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome,
          evidenceText: evidenceText || undefined,
          evidenceUrl: evidenceUrl || undefined,
          sourceUrl: sourceUrl || undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "ProofFlow action failed.");
      setMessage(kind === "provisional" ? "Outcome proposed. Challenge window is open." : "Challenge submitted. Evidence Review is open.");
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ProofFlow action failed.");
    } finally {
      setBusy(false);
    }
  }

  function SettlementForm({ kind }: { kind: "provisional" | "challenge" }) {
    return (
      <form className="pf-action-form" onSubmit={(event) => submitSettlementAction(event, kind)}>
        <div className="pf-action-row">
          <label>
            <span>Outcome</span>
            <select value={outcome} onChange={(event) => setOutcome(event.target.value as "ride" | "fade" | "invalid")}>
              <option value="ride">YES</option>
              <option value="fade">NO</option>
              <option value="invalid">INVALID</option>
            </select>
          </label>
          <label>
            <span>Evidence URL</span>
            <input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://..." />
          </label>
        </div>
        <label>
          <span>Reason</span>
          <textarea value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} placeholder="Explain how the locked rules support this outcome." />
        </label>
        <label>
          <span>Source URL</span>
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Locked or supporting source URL" />
        </label>
        <button className="pf-button gold" disabled={busy} type="submit">{busy ? "Submitting..." : kind === "provisional" ? "Propose Outcome" : "Challenge Outcome"}</button>
        {message ? <p className="pf-copy">{message}</p> : null}
      </form>
    );
  }

  if (state === "live") {
    return (
      <article className="pf-card pf-action-panel">
        <div className="pf-card-top"><span>Action</span><b>Trade live</b></div>
        <a className="pf-button gold" href="#market-actions">Open trade ticket</a>
      </article>
    );
  }
  if (state === "closed") {
    return (
      <article className="pf-card pf-action-panel">
        <div className="pf-card-top"><span>Action</span><b>Awaiting proposal</b></div>
        <SettlementForm kind="provisional" />
      </article>
    );
  }
  if (state === "auto_source_check") {
    return (
      <article className="pf-card pf-action-panel">
        <div className="pf-card-top"><span>Auto source check</span><b>{outcomeLabel(proofFlow.provisionalOutcome)}</b></div>
        <p className="pf-copy">
          {proofFlow.provisionalOutcome
            ? "A provisional outcome is posted. The challenge window is open."
            : "ProofFlow is checking the locked source before posting a provisional outcome."}
        </p>
        <div className="pf-lines">
          <div><span>Challenge countdown</span><b>{proofFlow.provisionalOutcome ? challengeCountdown : "Waiting for source check"}</b></div>
        </div>
        {hasResolutionNote ? (
          <div className="pf-action-row">
            <a className="pf-button" href="#pf-settlement-receipt">View Resolution Note</a>
          </div>
        ) : null}
        {proofFlow.provisionalOutcome ? <SettlementForm kind="challenge" /> : null}
      </article>
    );
  }
  if (state === "proposed") {
    return (
      <article className="pf-card pf-action-panel">
        <div className="pf-card-top"><span>Action</span><b>Challenge window open</b></div>
        <div className="pf-lines">
          <div><span>Challenge countdown</span><b>{challengeCountdown}</b></div>
        </div>
        <div className="pf-action-row">
          <a className="pf-button" href="#pf-proposal-evidence">View Proposal Evidence</a>
        </div>
        <SettlementForm kind="challenge" />
      </article>
    );
  }
  if (state === "challenged") {
    return (
      <article className="pf-card pf-action-panel">
        <div className="pf-card-top"><span>Action</span><b>Evidence Review</b></div>
        <a className="pf-button gold" href="#pf-evidence-board">View Evidence Board</a>
      </article>
    );
  }
  if (state === "additional_review") {
    return (
      <article className="pf-card pf-action-panel">
        <div className="pf-card-top"><span>Additional Review</span><b>Fresh panel</b></div>
        <p className="pf-copy">A fresh Prover panel is checking the evidence before final settlement.</p>
      </article>
    );
  }
  if (state === "invalid") {
    return (
      <article className="pf-card pf-action-panel">
        <div className="pf-card-top"><span>Action</span><b>Claim payout</b></div>
        <div className="pf-action-row">
          <a className="pf-button" href="#pf-settlement-receipt">View Settlement Receipt</a>
          <a className="pf-button gold" href="#pf-settlement-receipt">Claim Payout</a>
        </div>
      </article>
    );
  }
  return (
    <article className="pf-card pf-action-panel">
      <div className="pf-card-top"><span>Action</span><b>Finalized</b></div>
      <div className="pf-action-row">
        <a className="pf-button gold" href="#pf-settlement-receipt">Claim Winnings</a>
        <a className="pf-button" href="#pf-settlement-receipt">View Receipt</a>
        <a className="pf-button" href="#pf-settlement-receipt">Share Receipt</a>
      </div>
    </article>
  );
}

export function EvidenceBoard({ proofFlow, state }: { proofFlow: Record<string, unknown>; state: SettlementPageState }) {
  const now = useNowTick();
  if (state !== "challenged" && state !== "additional_review") return null;
  const evidence = asArray(proofFlow.evidenceBoard);
  const currentPanel = asRecord(proofFlow.currentReviewPanel);
  const proposal = evidence.find((item) => asRecord(item).kind === "proposer_evidence");
  const challenge = evidence.find((item) => asRecord(item).kind === "challenge_evidence");
  const proposalRow = asRecord(proposal);
  const challengeRow = asRecord(challenge);
  const proverCount = typeof currentPanel.proverCount === "number" ? currentPanel.proverCount : currentPanel.reviewerCount;
  const proverPanelLabel = typeof proverCount === "number"
    ? `${proverCount.toLocaleString()} selected`
    : "Private panel";
  return (
    <article className="pf-card pf-evidence" id="pf-evidence-board">
      <div className="pf-card-top">
        <span>Evidence Board</span>
        <b>{state === "additional_review" ? "Additional review" : "Review open"}</b>
      </div>
      <div className="pf-evidence-grid">
        <div className="pf-evidence-row">
          <span>Proposal evidence</span>
          <b>{outcomeLabel(proposalRow.outcome)}</b>
          <p>{text(proposalRow.evidenceText, "Proposal evidence is recorded.")}</p>
          <em>{proposalRow.evidenceUrl ? sourceLabel(proposalRow.evidenceUrl) : compactDate(proposalRow.createdAt)}</em>
        </div>
        <div className="pf-evidence-row">
          <span>Challenge evidence</span>
          <b>{outcomeLabel(challengeRow.outcome)}</b>
          <p>{text(challengeRow.evidenceText, "Challenge evidence is recorded.")}</p>
          <em>{challengeRow.evidenceUrl ? sourceLabel(challengeRow.evidenceUrl) : compactDate(challengeRow.createdAt)}</em>
        </div>
      </div>
      <div className="pf-lines">
        <div><span>Review status</span><b>{text(currentPanel.publicMessage, "Private Prover notes are hidden until settlement finalizes.")}</b></div>
        <div><span>Prover panel</span><b>{proverPanelLabel}</b></div>
        <div><span>Countdown</span><b>{countdownLabel(currentPanel.revealDeadline, now)}</b></div>
        <div><span>Proposal bond</span><b>{money(proposalRow.bondAmount ?? proofFlow.bondAmount)} - {statusLabel(proposalRow.bondStatus ?? proofFlow.proposerBondStatus ?? "recorded")}</b></div>
        <div><span>Challenge bond</span><b>{money(challengeRow.bondAmount ?? proofFlow.bondAmount)} - {statusLabel(challengeRow.bondStatus ?? proofFlow.challengerBondStatus ?? "recorded")}</b></div>
      </div>
      <p className="pf-copy">Prover notes are private during review and are not visible to other Provers or the public until finalization.</p>
    </article>
  );
}

export function SettlementReceipt({ market, proofFlow, state }: { market: NexMarket; proofFlow: Record<string, unknown>; state: SettlementPageState }) {
  const [receiptMessage, setReceiptMessage] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const wallet = useWalletSession();
  const activeChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  if (state !== "finalized" && state !== "invalid") return null;
  const receipt = asRecord(proofFlow.settlementReceipt);
  const note = asRecord(receipt.note ?? proofFlow.finalResolutionNote);
  const bondMovement = asRecord(receipt.bondMovement);
  const distribution = asArray(bondMovement.distribution ?? note.bondDistribution);
  const refundQueue = asArray(proofFlow.refundQueue);
  const vote = asRecord(note.reviewerVoteBreakdown);
  const topNote = Array.isArray(note.topEvidenceNote) ? asRecord(note.topEvidenceNote[0]) : asRecord(note.topEvidenceNote);
  const resolution = asRecord(proofFlow.resolution);
  const onchainSettlementTxHash = text(
    note.onchainReceiptHash ?? receipt.onchainSettlementTxHash ?? proofFlow.onchainSettlementTxHash ?? resolution.settlementTxHash ?? resolution.txHash,
    ""
  );
  const onchainSettlementReady = Boolean(onchainSettlementTxHash);
  const receiptPayload = JSON.stringify({ receipt, note, bondDistribution: distribution }, null, 2);

  async function shareReceipt() {
    const shareText = `${outcomeLabel(receipt.finalOutcome ?? proofFlow.finalOutcome)} settlement receipt`;
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: "NexMarkets ProofFlow receipt", text: shareText, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setReceiptMessage("Receipt link copied.");
  }

  function downloadReceipt() {
    const blob = new Blob([receiptPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `proofflow-receipt-${text(receipt.id, "market")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setReceiptMessage("Receipt downloaded.");
  }

  async function claimMarketPayout(side?: 0 | 1) {
    if (!market.contractAddress || !market.chainId) {
      setReceiptMessage("This market does not have a redeemable native contract address.");
      return;
    }
    if (!onchainSettlementReady) {
      setReceiptMessage("Claims unlock after the ProofFlow bot writes the final settlement to the native market contract.");
      return;
    }
    if (state === "invalid" && side === undefined) {
      setReceiptMessage("Choose Ride or Fade refund for the side you hold.");
      return;
    }
    setClaimBusy(true);
    setReceiptMessage("");
    try {
      await wallet.ensureSignedIn();
      if (activeChainId !== market.chainId) {
        await switchChainAsync({ chainId: market.chainId });
      }
      const hash = state === "invalid"
        ? await writeContractAsync({
          address: market.contractAddress as Address,
          abi: nativeBinaryMarketAbi,
          functionName: "refund",
          args: [side ?? 0]
        })
        : await writeContractAsync({
          address: market.contractAddress as Address,
          abi: nativeBinaryMarketAbi,
          functionName: "redeem"
        });
      setReceiptMessage(`${state === "invalid" ? "Refund" : "Redeem"} submitted: ${hash}`);
    } catch (error) {
      setReceiptMessage(userFacingTransactionError(error, "Claim transaction failed."));
    } finally {
      setClaimBusy(false);
    }
  }

  return (
    <article className="pf-card pf-receipt" id="pf-settlement-receipt">
      <div className="pf-card-top">
        <span>Settlement Receipt</span>
        <b>{outcomeLabel(receipt.finalOutcome ?? proofFlow.finalOutcome)}</b>
      </div>
      {state === "invalid" ? (
        <p className="pf-copy">Truth could not be proven from the locked rules. YES and NO shares redeem at equal value.</p>
      ) : (
        <p className="pf-copy">{text(note.reason, "ProofFlow finalized from the locked source, evidence board and Prover consensus.")}</p>
      )}
      <div className="pf-lines">
        <div><span>Outcome reason</span><b>{text(note.auditSummary ?? proofFlow.auditSummary, "NexMind Audit found no serious issue with Prover-supported evidence.")}</b></div>
        <div><span>Vote summary</span><b>{text(vote.summary, vote.agreementCount ? `${vote.agreementCount} of 5 supported ${outcomeLabel(vote.topOutcome)}` : "No confidence reached")}</b></div>
        <div><span>Top Evidence Note</span><b>{text(topNote.note, "No single top note was selected.")}</b></div>
        <div><span>Receipt hash status</span><b>{statusLabel(receipt.hashStatus ?? "PENDING_HASH")}</b></div>
        <div><span>Receipt hash</span><b>{text(receipt.receiptHash, "Pending")}</b></div>
        <div><span>Refund status</span><b>{statusLabel(receipt.refundStatus ?? proofFlow.refundStatus ?? "not_required")}</b></div>
        <div><span>Refund transaction</span><b>{text(asRecord(refundQueue.find((item) => asRecord(item).txHash)).txHash, "Pending")}</b></div>
        <div><span>Onchain settlement</span><b>{onchainSettlementReady ? onchainSettlementTxHash : "Pending native settlement"}</b></div>
      </div>
      <div className="pf-distribution">
        <span>Bond distribution</span>
        {distribution.length ? distribution.map((item, index) => {
          const row = asRecord(item);
          return (
            <div key={`${text(row.role, "recipient")}-${index}`}>
              <b>{text(row.recipient, text(row.role, "recipient"))}</b>
              <strong>{money(row.amountUsdc)}</strong>
            </div>
          );
        }) : (
          <div><b>NexMarkets</b><strong>$0.00</strong></div>
        )}
      </div>
      {refundQueue.length ? (
        <div className="pf-distribution">
          <span>Refund execution</span>
          {refundQueue.map((item, index) => {
            const row = asRecord(item);
            return (
              <div key={`refund-${index}`}>
                <b>{text(row.recipientWallet, "recipient")} - {statusLabel(row.status)}</b>
                <strong>{text(row.txHash, "Pending tx")}</strong>
              </div>
            );
          })}
        </div>
      ) : null}
      {!onchainSettlementReady ? (
        <p className="pf-copy">Claims stay locked until the native market contract is finalized onchain.</p>
      ) : null}
      <div className="pf-action-row">
        {state === "invalid" ? (
          <>
            <button className="pf-button gold" disabled={claimBusy || !onchainSettlementReady} onClick={() => void claimMarketPayout(0)} type="button">{claimBusy ? "Claiming..." : "Refund Ride"}</button>
            <button className="pf-button gold" disabled={claimBusy || !onchainSettlementReady} onClick={() => void claimMarketPayout(1)} type="button">{claimBusy ? "Claiming..." : "Refund Fade"}</button>
          </>
        ) : (
          <button className="pf-button gold" disabled={claimBusy || !onchainSettlementReady} onClick={() => void claimMarketPayout()} type="button">{claimBusy ? "Claiming..." : "Claim Winnings"}</button>
        )}
        <a className="pf-button" href="#pf-settlement-receipt">View Receipt</a>
        <button className="pf-button" onClick={() => void shareReceipt()} type="button">Share Receipt</button>
        <button className="pf-button" onClick={downloadReceipt} type="button">Download</button>
      </div>
      {receiptMessage ? <p className="pf-copy">{receiptMessage}</p> : null}
    </article>
  );
}

function OutcomeProposedSummary({ proofFlow }: { proofFlow: Record<string, unknown> }) {
  const evidence = asArray(proofFlow.evidenceBoard);
  const proposal = asRecord(evidence.find((item) => asRecord(item).kind === "proposer_evidence"));
  const now = useNowTick();
  if (!proposal.id) return null;
  return (
    <article className="pf-card pf-proposal-summary" id="pf-proposal-evidence">
      <div className="pf-card-top">
        <span>Outcome Proposed</span>
        <b>{outcomeLabel(proposal.outcome)}</b>
      </div>
      <div className="pf-lines">
        <div><span>Proposer</span><b>{text(proposal.walletAddress, "Recorded proposer")}</b></div>
        <div>
          <span>Evidence</span>
          <b>
            {proposal.evidenceUrl ? (
              <a className="pf-inline-link" href={String(proposal.evidenceUrl)} target="_blank" rel="noreferrer">View Proposal Evidence</a>
            ) : "Evidence text"}
          </b>
        </div>
        <div><span>Reason</span><b>{text(proposal.evidenceText, "Provisional outcome submitted with public evidence.")}</b></div>
        <div><span>Challenge countdown</span><b>{countdownLabel(proofFlow.challengeWindowEndsAt, now)}</b></div>
      </div>
    </article>
  );
}

function ProverConflictReport({ marketId, proofFlow, state }: { marketId: string; proofFlow: Record<string, unknown>; state: SettlementPageState }) {
  const currentPanel = asRecord(proofFlow.currentReviewPanel);
  const [reason, setReason] = useState("prover_holds_position");
  const [proverWallet, setProverWallet] = useState("");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (state !== "challenged" && state !== "additional_review") return null;

  async function submitConflict(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/markets/${marketId}/proof-flow/reviewer-conflict`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          panelId: typeof currentPanel.id === "string" ? currentPanel.id : undefined,
          proverWallet: proverWallet || undefined,
          reviewerWallet: proverWallet || undefined,
          reason,
          details: details || undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Conflict report failed.");
      setMessage("Conflict report submitted for moderation.");
      setProverWallet("");
      setDetails("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Conflict report failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="pf-card pf-action-panel">
      <div className="pf-card-top"><span>Report Prover Conflict</span><b>Moderation queue</b></div>
      <form className="pf-action-form" onSubmit={submitConflict}>
        <div className="pf-action-row">
          <label>
            <span>Reason</span>
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="prover_holds_position">Prover holds position</option>
              <option value="prover_related_to_proposer">Related to proposer</option>
              <option value="prover_related_to_challenger">Related to challenger</option>
              <option value="prover_related_to_creator">Related to creator</option>
              <option value="undisclosed_relationship">Undisclosed relationship</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span>Prover wallet</span>
            <input value={proverWallet} onChange={(event) => setProverWallet(event.target.value)} placeholder="Optional if unknown" />
          </label>
        </div>
        <label>
          <span>Details</span>
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Describe the conflict and evidence for moderation." />
        </label>
        <button className="pf-button" disabled={busy} type="submit">{busy ? "Submitting..." : "Report conflict"}</button>
        {message ? <p className="pf-copy">{message}</p> : null}
      </form>
    </article>
  );
}

export function ProofFlowPanel({ market }: { market: NexMarket }) {
  if (market.origin !== "native") return null;

  const proofFlow = asRecord(market.proofFlow);
  const card = asRecord(proofFlow.resolutionCard ?? market.resolutionCard);
  const state = settlementState(market, proofFlow, card);

  return (
    <section className="v40-panel pf-panel" aria-label="ProofFlow settlement">
      <div className="pf-head">
        <div>
          <span className="v40-state native">ProofFlow</span>
          <h3>Settlement.</h3>
        </div>
        <div className="pf-status-pill">{statusLabel(state)}</div>
      </div>

      <div className="pf-grid">
        <SettlementStatusCard market={market} proofFlow={proofFlow} card={card} state={state} />
        <SettlementTimeline state={state} />
      </div>

      <div className="pf-grid lower">
        <SettlementActionPanel marketId={market.id} state={state} proofFlow={proofFlow} />
        <MarketSentimentAtCloseCard market={market} proofFlow={proofFlow} state={state} />
        {state === "additional_review" ? (
          <article className="pf-card">
            <div className="pf-card-top"><span>Additional Review Required</span><b>Fresh panel</b></div>
            <p className="pf-copy">A fresh Prover panel is checking the evidence before final settlement.</p>
            <p className="pf-copy">The market will finalize only when settlement confidence is reached. If locked rules cannot prove an outcome, it resolves Invalid.</p>
          </article>
        ) : state === "proposed" || state === "auto_source_check" ? (
          <OutcomeProposedSummary proofFlow={proofFlow} />
        ) : (
          <article className="pf-card">
            <div className="pf-card-top"><span>Current state</span><b>{statusLabel(state)}</b></div>
            <p className="pf-copy">
              {state === "live"
                ? "Trading is live. The locked Resolution Card is visible before the market closes."
                : state === "closed"
                  ? "Trading is disabled. ProofFlow is awaiting an outcome proposal."
                  : state === "invalid"
                    ? "Truth could not be proven from the locked rules, so the market resolves Invalid."
                    : "ProofFlow settlement is recorded publicly."}
            </p>
          </article>
        )}
      </div>

      <EvidenceBoard proofFlow={proofFlow} state={state} />
      <ProverConflictReport marketId={market.id} proofFlow={proofFlow} state={state} />
      <SettlementReceipt market={market} proofFlow={proofFlow} state={state} />
    </section>
  );
}
