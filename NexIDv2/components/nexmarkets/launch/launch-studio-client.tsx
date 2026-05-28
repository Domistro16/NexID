"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { zeroAddress, zeroHash, type Hex } from "viem";
import { useWalletSession } from "@/components/nexid/shared/wallet-session";
import { marketOriginDetail, marketRiskLabel, marketTemplateLabel, routeStatusLabel, toTitleLabel } from "@/components/nexmarkets/copy";
import {
  DEFAULT_NATIVE_MARKETS_CHAIN_ID,
  LAUNCH_STAKE_USDC,
  defaultNativeCloseTime,
  draftMetadataHash,
  draftRulesHash,
  erc20Abi,
  formatUsdcUnits,
  marketFactoryAbi,
  nativeMarketAddresses,
  templateIdFor
} from "@/lib/contracts/nexmarkets";
import {
  createNativeMarketApi,
  fetchNexMarketApi,
  routeCheckApi,
  shapeMarketApi,
  syncNativeMarketEventsApi
} from "@/lib/services/nexid-client";
import type { NexMarket, RouteDecision, ShapedMarketDraft } from "@/lib/types/nexmarkets";

const arenaOptions = ["crypto", "football", "culture"] as const;

function shortHash(value: string | null | undefined) {
  if (!value) return "-";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function missingFieldLabel(draft: ShapedMarketDraft) {
  if (!draft.missingFields.length) return null;
  return draft.missingFields.map((field) => {
    if (field === "source_url") return "source link";
    if (field === "close_at" || field === "timeframe") return "deadline";
    return field.replace(/_/g, " ");
  }).join(", ");
}

function launchReadinessMessage(draft: ShapedMarketDraft) {
  if (draft.riskStatus === "blocked") return draft.blockedReason ?? "This thesis is blocked by market safety rules.";
  const missing = missingFieldLabel(draft);
  if (missing) return `Missing: ${missing}. Add that detail to the thesis and shape it again before launch.`;
  return null;
}

function timeframeLabel(draft: ShapedMarketDraft) {
  if (!draft.timeframe) return "Needs refinement";
  return draft.timeframe.label || new Date(draft.timeframe.closeAt).toLocaleDateString();
}

function closeTimeForDraft(draft: ShapedMarketDraft) {
  if (!draft.timeframe?.closeAt) return defaultNativeCloseTime();
  const timestamp = Math.floor(new Date(draft.timeframe.closeAt).getTime() / 1000);
  return Number.isFinite(timestamp) && timestamp > Math.floor(Date.now() / 1000)
    ? BigInt(timestamp)
    : defaultNativeCloseTime();
}

function publicMarketText(value: string) {
  return value
    .replace(/Polymarket market/gi, "existing market")
    .replace(/Polymarket/gi, "an existing market")
    .replace(/native market/gi, "NexMarkets market")
    .replace(/native launch/gi, "launch")
    .replace(/route check/gi, "market fit check");
}

export function LaunchStudioClient() {
  const [rawThesis, setRawThesis] = useState("");
  const [arenaHint, setArenaHint] = useState<(typeof arenaOptions)[number]>("crypto");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShapedMarketDraft | null>(null);
  const [decision, setDecision] = useState<RouteDecision | null>(null);
  const [market, setMarket] = useState<NexMarket | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [confirmedLaunchAllowance, setConfirmedLaunchAllowance] = useState<bigint | null>(null);

  const walletSession = useWalletSession();
  const { address } = useAccount();
  const activeChainId = useChainId();
  const nativeChainId = DEFAULT_NATIVE_MARKETS_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: nativeChainId });
  const { switchChainAsync, isPending: switchingChain } = useSwitchChain();
  const { writeContractAsync, isPending: writingContract } = useWriteContract();
  const addresses = useMemo(() => nativeMarketAddresses(nativeChainId), [nativeChainId]);
  const templateId = draft ? templateIdFor(draft.template) : zeroHash;
  const hasContractConfig = Boolean(addresses.factory && addresses.collateral);

  const balanceQuery = useReadContract({
    address: addresses.collateral ?? zeroAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: nativeChainId,
    query: { enabled: Boolean(address && addresses.collateral) }
  });
  const allowanceQuery = useReadContract({
    address: addresses.collateral ?? zeroAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, addresses.factory ?? zeroAddress],
    chainId: nativeChainId,
    query: { enabled: Boolean(address && addresses.collateral && addresses.factory) }
  });
  const templateAllowedQuery = useReadContract({
    address: addresses.factory ?? zeroAddress,
    abi: marketFactoryAbi,
    functionName: "allowedTemplates",
    args: [templateId],
    chainId: nativeChainId,
    query: { enabled: Boolean(draft && addresses.factory) }
  });

  const launchAllowance = confirmedLaunchAllowance && confirmedLaunchAllowance > (allowanceQuery.data ?? BigInt(0))
    ? confirmedLaunchAllowance
    : allowanceQuery.data ?? BigInt(0);
  const hasLaunchBalance = (balanceQuery.data ?? BigInt(0)) >= LAUNCH_STAKE_USDC;
  const hasLaunchAllowance = launchAllowance >= LAUNCH_STAKE_USDC;
  const launchBusy = loading || approving || launching || switchingChain || writingContract || walletSession.busy;
  const routeAllowsNativeLaunch = decision?.recommendedAction === "launch_native";
  const relatedCandidates = decision
    ? [...decision.polymarketCandidates, ...decision.nativeCandidates].filter((candidate) => candidate.matchType === "related")
    : [];
  const readinessMessage = draft ? launchReadinessMessage(draft) : null;
  const templateStatus = !draft
    ? "-"
    : !addresses.factory
      ? "Unavailable"
      : templateAllowedQuery.isLoading || templateAllowedQuery.isFetching
        ? "Checking"
        : templateAllowedQuery.isError
          ? "Needs review"
          : templateAllowedQuery.data === true
            ? "Ready"
            : templateAllowedQuery.data === false
              ? "Not open yet"
              : "Pending";
  const launchBlockedReason = !draft
    ? "Shape a market first."
    : !draftId
      ? "Draft was not saved. Shape the market again."
      : draft.riskStatus !== "allowed"
        ? readinessMessage ?? "Resolve the draft before launch."
        : !decision
          ? "Check market fit before launch."
          : !routeAllowsNativeLaunch
            ? "This thesis already fits an existing market."
            : !hasContractConfig
              ? "Launch payments are not ready yet."
              : templateAllowedQuery.isLoading
                ? "Checking whether this market style is open."
                : templateAllowedQuery.data === false
                  ? "This market style is not open for launch yet."
                  : null;

  useEffect(() => {
    setConfirmedLaunchAllowance(null);
  }, [address, addresses.collateral, addresses.factory]);

  async function shape() {
    setLoading(true);
    setMessage("");
    setDecision(null);
    setMarket(null);
    setTxHash(null);
    try {
      const response = await shapeMarketApi({ rawThesis, arenaHint });
      setDraftId(response.draftId);
      setDraft(response.draft);
      setMessage("Market draft ready. Check whether a matching market already exists.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not shape market.");
    } finally {
      setLoading(false);
    }
  }

  async function routeCheck() {
    if (!draft) return;
    setLoading(true);
    setMessage("");
    setTxHash(null);
    try {
      const response = await routeCheckApi({ draftId: draftId ?? undefined, draft });
      setDecision(response.decision);
      setMarket(response.market);
      setMessage(publicMarketText(response.decision.reason));
    } catch (error) {
      setMessage(error instanceof Error ? publicMarketText(error.message) : "Market fit check failed.");
    } finally {
      setLoading(false);
    }
  }

  async function ensureNativeChain() {
    const user = await walletSession.ensureSignedIn();
    if (activeChainId !== nativeChainId) {
      await switchChainAsync({ chainId: nativeChainId });
    }
    return user;
  }

  async function waitForTransaction(hash: Hex) {
    if (!publicClient) throw new Error("Network connection is still loading. Try again.");
    setTxHash(hash);
    return publicClient.waitForTransactionReceipt({ hash });
  }

  async function approveLaunchStake() {
    if (!addresses.collateral || !addresses.factory) {
      setMessage("Launch payments are not ready yet.");
      return;
    }
    setApproving(true);
    setMessage("Preparing approval for the $20 launch stake.");
    try {
      await ensureNativeChain();
      if (!hasLaunchBalance) throw new Error("Your wallet needs at least 20 USDC to launch.");
      const hash = await writeContractAsync({
        address: addresses.collateral,
        abi: erc20Abi,
        functionName: "approve",
        args: [addresses.factory, LAUNCH_STAKE_USDC],
        chainId: nativeChainId
      });
      const receipt = await waitForTransaction(hash);
      if (receipt.status !== "success") throw new Error("Launch stake approval was rejected or failed.");
      if (!publicClient) throw new Error("Network connection is still loading. Try again.");
      const nextAllowance = await publicClient.readContract({
        address: addresses.collateral,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address ?? zeroAddress, addresses.factory]
      });
      setConfirmedLaunchAllowance(nextAllowance);
      await Promise.all([allowanceQuery.refetch(), balanceQuery.refetch()]);
      setMessage(nextAllowance >= LAUNCH_STAKE_USDC
        ? "Launch stake approved. You can launch the market now."
        : `Approval confirmed, but your spending limit is still ${formatUsdcUnits(nextAllowance)} USDC. Try approving again from your wallet.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setApproving(false);
    }
  }

  async function connectWalletForLaunch() {
    setMessage("");
    try {
      await walletSession.ensureSignedIn();
      setMessage("Wallet connected. Approve the launch stake when you are ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function launchNativeMarket() {
    if (!draft || !draftId) return;
    if (launchBlockedReason) {
      setMessage(launchBlockedReason);
      return;
    }
    if (!addresses.factory || !addresses.collateral) {
      setMessage("Launch payments are not ready yet.");
      return;
    }
    setLaunching(true);
    setMessage("Preparing market launch.");
    try {
      const user = await ensureNativeChain();
      if (!hasLaunchBalance) throw new Error("Your wallet needs at least 20 USDC to launch.");
      if (!hasLaunchAllowance) throw new Error("Approve the $20 launch stake before launching.");

      const rulesHash = draftRulesHash(draft);
      const metadataHash = draftMetadataHash(draft);
      const closeTime = closeTimeForDraft(draft);
      const nativeResponse = await createNativeMarketApi({
        draftId,
        walletAddress: user.walletAddress,
        chainId: nativeChainId,
        rulesHash,
        metadataHash,
        template: draft.template,
        closeTime: Number(closeTime)
      });
      setMarket(nativeResponse.market);

      if (nativeResponse.market.contractAddress) {
        setMessage("This market is already live.");
        return;
      }
      if (!nativeResponse.transaction.authorization) {
        throw new Error("Your .id could not be verified for launch. Confirm your primary .id and try again.");
      }

      setMessage("Launching your market.");
      const hash = await writeContractAsync({
        address: addresses.factory,
        abi: marketFactoryAbi,
        functionName: "createMarket",
        args: [
          rulesHash,
          metadataHash,
          templateIdFor(draft.template),
          BigInt(nativeResponse.transaction.closeTime),
          {
            nonce: BigInt(nativeResponse.transaction.authorization.nonce),
            deadline: BigInt(nativeResponse.transaction.authorization.deadline),
            signature: nativeResponse.transaction.authorization.signature
          }
        ],
        chainId: nativeChainId
      });
      const receipt = await waitForTransaction(hash);
      if (receipt.status !== "success") {
        throw new Error("The launch did not complete. No market was created.");
      }

      setMessage("Launch confirmed. Preparing the market room.");
      try {
        await syncNativeMarketEventsApi(nativeChainId, receipt.blockNumber);
        const refreshed = await fetchNexMarketApi(nativeResponse.market.id);
        setMarket(refreshed);
      } catch (syncError) {
        const fallbackMarket = await fetchNexMarketApi(nativeResponse.market.id).catch(() => nativeResponse.market);
        setMarket(fallbackMarket);
        setMessage("Launch confirmed, but the market room is still updating. Refresh in a moment.");
        return;
      }
      if (!publicClient) throw new Error("Network connection is still loading. Try again.");
      const nextAllowance = await publicClient.readContract({
        address: addresses.collateral,
        abi: erc20Abi,
        functionName: "allowance",
        args: [user.walletAddress as `0x${string}`, addresses.factory]
      });
      setConfirmedLaunchAllowance(nextAllowance);
      await Promise.all([allowanceQuery.refetch(), balanceQuery.refetch()]);
      setMessage("Market launched. Open the room to trade when it is ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Market launch failed.");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <section className="view active">
      <div className="launch-studio">
        <div className="launch-stage">
          <div className="eyebrow"><i className="dot" /> Thesis Studio</div>
          <h1>Turn a thesis into a market.</h1>
          <p>Start with the belief. NexMarkets shapes it into a clear question, checks whether it already exists, and lets you launch only when the rules are ready.</p>
        </div>
        <div className="launch-console">
          <label>
            <span>Your thesis</span>
            <textarea
              value={rawThesis}
              onChange={(event) => setRawThesis(event.target.value)}
              placeholder="HYPE hits $50 before June 30"
            />
          </label>
          <div className="tabs">
            {arenaOptions.map((arena) => (
              <button key={arena} className={arenaHint === arena ? "active" : ""} onClick={() => setArenaHint(arena)} type="button">
                {arena[0].toUpperCase()}{arena.slice(1)}
              </button>
            ))}
          </div>
          <div className="launch-actions">
            <button className="primary" type="button" disabled={loading || rawThesis.trim().length < 4} onClick={shape}>
              Shape Market
            </button>
            <button className="btn" type="button" disabled={loading || !draft} onClick={routeCheck}>
              Check Fit
            </button>
          </div>
          {message ? <div className="wallet-note"><b>Status:</b> {message}</div> : null}
          {txHash ? (
            <Link className="btn" href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer">
              View Transaction {shortHash(txHash)}
            </Link>
          ) : null}
        </div>
      </div>

      {draft ? (
        <section className="section detail-grid">
          <div className="market-body">
            <div className="social-panel">
              <div className="dash-panel-head">
                <div>
                  <h2>{draft.title}</h2>
                  <p>{draft.question}</p>
                </div>
                <span className={`status-pill ${draft.riskStatus === "allowed" ? "ok" : draft.riskStatus === "blocked" ? "bad" : "idle"}`}>
                  {marketRiskLabel(draft.riskStatus)}
                </span>
              </div>
              <div className="nexmarket-detail-grid">
                <div><span>Arena</span><b>{toTitleLabel(draft.arena)}</b></div>
                <div><span>Style</span><b>{marketTemplateLabel(draft.template)}</b></div>
                <div><span>Timeframe</span><b>{timeframeLabel(draft)}</b></div>
                <div><span>Source</span><b>{draft.settlementSource ?? "Needs source"}</b></div>
              </div>
              <div className="rule">
                <span className="num">R</span>
                <div>
                  <b>Ride / Fade</b>
                  <span><strong>Ride:</strong> {draft.sides.ride}<br /><strong>Fade:</strong> {draft.sides.fade}</span>
                </div>
              </div>
              <div className="rule">
                <span className="num">S</span>
                <div>
                  <b>How It Resolves</b>
                  <span>{draft.resolution.method}</span>
                </div>
              </div>
              {readinessMessage ? (
                <div className="launch-readiness">
                  <b>Launch needs refinement</b>
                  <span>{readinessMessage}</span>
                </div>
              ) : null}
            </div>

            {decision ? (
              <div className="social-panel">
                <div className="dash-panel-head">
                  <div>
                    <h2>Market Fit</h2>
                    <p>{publicMarketText(decision.reason)}</p>
                  </div>
                  <span className="status-pill ok">{routeStatusLabel(decision.status)}</span>
                </div>
                <div className="compact-list">
                  {[...decision.polymarketCandidates, ...decision.nativeCandidates].map((candidate) => (
                    <div className="compact-row" key={`${candidate.origin}:${candidate.id}`}>
                      <div>
                        <b>{candidate.title}</b>
                        <span>{marketOriginDetail(candidate.origin)} - {toTitleLabel(candidate.matchType)} - {(candidate.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <small>{publicMarketText(candidate.reason)}</small>
                    </div>
                  ))}
                  {!decision.polymarketCandidates.length && !decision.nativeCandidates.length ? (
                    <div className="internal-empty">No close market was found.</div>
                  ) : null}
                </div>
                {decision.status === "related" && relatedCandidates.length ? (
                  <div className="launch-readiness">
                    <b>Similar, But Different</b>
                    <span>The closest match is {Math.round(relatedCandidates[0].confidence * 100)}% similar. You can still launch this thesis when its deadline, metric or source is clearly different.</span>
                  </div>
                ) : null}
                {market ? <Link className="primary" href={`/market/${market.id}`}>Open Market Room</Link> : null}
              </div>
            ) : null}
          </div>

          <aside className="ticket">
            <h3>Launch Market</h3>
            <div className="summary">
              <div><span>Launch stake</span><b>$20 USDC</b></div>
              <div><span>Fee</span><b>$10</b></div>
              <div><span>Quality bond</span><b>$10</b></div>
              <div><span>Wallet</span><b>{shortHash(address)}</b></div>
              <div><span>Balance</span><b>{formatUsdcUnits(balanceQuery.data)} USDC</b></div>
              <div><span>Approval</span><b>{hasLaunchAllowance ? "Approved" : `${formatUsdcUnits(launchAllowance)} USDC`}</b></div>
              <div><span>Market style</span><b>{templateStatus}</b></div>
            </div>
            {launchBlockedReason ? <p className="risk-line">{launchBlockedReason}</p> : null}
            {!hasLaunchBalance && address ? <p className="risk-line">You need 20 USDC before launch.</p> : null}
            {!address ? (
              <button className="execute" type="button" disabled={launchBusy} onClick={connectWalletForLaunch}>
                Connect Wallet
              </button>
            ) : (
              <>
                <button
                  className="btn execute-secondary"
                  type="button"
                  disabled={launchBusy || Boolean(launchBlockedReason) || hasLaunchAllowance || !hasLaunchBalance}
                  onClick={approveLaunchStake}
                >
                  {hasLaunchAllowance ? "Stake Approved" : approving ? "Approving..." : "Approve $20 Stake"}
                </button>
                <button
                  className="execute"
                  type="button"
                  disabled={launchBusy || Boolean(launchBlockedReason) || !hasLaunchAllowance || !hasLaunchBalance}
                  onClick={launchNativeMarket}
                >
                  {launching ? "Launching..." : "Launch Market"}
                </button>
              </>
            )}
            <p className="risk-line">Launch only when the question, deadline and source are clear enough for traders to judge.</p>
          </aside>
        </section>
      ) : null}
    </section>
  );
}
