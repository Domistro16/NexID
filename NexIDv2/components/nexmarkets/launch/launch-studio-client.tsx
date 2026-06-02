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

  useEffect(() => {
    const incoming = new URLSearchParams(window.location.search).get("thesis");
    if (incoming && !rawThesis) setRawThesis(incoming);
  }, [rawThesis]);

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

      const closeTime = closeTimeForDraft(draft);
      const nativeResponse = await createNativeMarketApi({
        draftId,
        walletAddress: user.walletAddress,
        chainId: nativeChainId,
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
      const rulesHash = nativeResponse.transaction.rulesHash as Hex;
      const metadataHash = nativeResponse.transaction.metadataHash as Hex;
      const templateId = nativeResponse.transaction.templateId as Hex;
      const hash = await writeContractAsync({
        address: addresses.factory,
        abi: marketFactoryAbi,
        functionName: "createMarket",
        args: [
          rulesHash,
          metadataHash,
          templateId,
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
    <section id="launch" className="view active">
      <div className="ly-root">
        <div className="ly-hero">
          <aside className="ly-rail left">
            <div className="ly-stream">
              <div className="ly-track">
                <div className="ly-idea"><small>Step 1</small><b>Write the thesis</b><span>{rawThesis || "Waiting for a clear belief."}</span></div>
                <div className="ly-idea"><small>Step 2</small><b>Shape the market</b><span>{draft ? draft.title : "The composer turns it into rules."}</span></div>
                <div className="ly-idea"><small>Step 3</small><b>Check route</b><span>{decision ? routeStatusLabel(decision.status) : "Search for matching live markets."}</span></div>
              </div>
              <div className="ly-track">
                <div className="ly-idea"><small>Step 4</small><b>Launch when ready</b><span>{market ? market.title : "Only launch when the market is truly missing."}</span></div>
                <div className="ly-idea"><small>Stake</small><b>$20 USDC</b><span>$10 launch fee and $10 quality bond.</span></div>
              </div>
            </div>
          </aside>

          <section className="ly-card">
            <div className="ly-top">
              <span className="ly-pill"><i /> Thesis Studio</span>
              <span className="ly-note">{draft ? "Draft ready" : "Start with the belief"}</span>
            </div>
            <h1>Turn a thesis into a market.</h1>
            <p className="ly-lead">Start with the belief. NexMarkets shapes it into a clear question, checks whether it already exists, and lets you launch only when the rules are ready.</p>
            <div className="ly-inputbox">
              <label className="ly-label" htmlFor="launch-thesis"><span>Your thesis</span><span>{rawThesis.length} chars</span></label>
              <textarea
                id="launch-thesis"
                className="ly-thesis"
                value={rawThesis}
                onChange={(event) => setRawThesis(event.target.value)}
                placeholder="Will Portugal win the 2026 FIFA World Cup by July 19, 2026?"
              />
              <div className="ly-actions">
                <div className="ly-chip-row">
                  {arenaOptions.map((arena) => (
                    <button key={arena} className={`ly-chip ${arenaHint === arena ? "active" : ""}`} onClick={() => setArenaHint(arena)} type="button">
                      {arena[0].toUpperCase()}{arena.slice(1)}
                    </button>
                  ))}
                </div>
                <button className="primary" type="button" disabled={loading || rawThesis.trim().length < 4} onClick={shape}>
                  {loading ? "Shaping..." : "Shape Market"}
                </button>
              </div>
              <div className="ly-actions">
                <span className="ly-hint">Shape first, then check whether the best action is trade, refine or launch.</span>
                <button className="btn" type="button" disabled={loading || !draft} onClick={routeCheck}>
                  Check Fit
                </button>
              </div>
            </div>
            {message ? <div className="wallet-note"><b>Status:</b> {message}</div> : null}
            {txHash ? (
              <Link className="btn" href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer">
                View Transaction {shortHash(txHash)}
              </Link>
            ) : null}
          </section>

          <aside className="ly-rail right">
            <div className="ly-stream">
              <div className="ly-track">
                <div className="ly-idea"><small>Risk</small><b>{draft ? marketRiskLabel(draft.riskStatus) : "Not shaped"}</b><span>{readinessMessage ?? "Launch checks appear after shaping."}</span></div>
                <div className="ly-idea"><small>Route</small><b>{decision ? routeStatusLabel(decision.status) : "Unchecked"}</b><span>{decision ? publicMarketText(decision.reason) : "Fit check has not run yet."}</span></div>
                <div className="ly-idea"><small>Wallet</small><b>{shortHash(address)}</b><span>{hasLaunchAllowance ? "Stake approved." : "Connect before launch."}</span></div>
              </div>
              <div className="ly-track">
                <div className="ly-idea"><small>Template</small><b>{templateStatus}</b><span>{draft ? marketTemplateLabel(draft.template) : "Pending draft."}</span></div>
                <div className="ly-idea"><small>Balance</small><b>{formatUsdcUnits(balanceQuery.data)} USDC</b><span>Launch requires 20 USDC.</span></div>
              </div>
            </div>
          </aside>
        </div>

        {draft ? (
          <section className="ly-review">
            <div className="ly-review-head">
              <div className="ly-review-title">
                <div>
                  <h2>{draft.title}</h2>
                  <p>{draft.question}</p>
                </div>
                <span className={`ly-status ${draft.riskStatus === "allowed" ? "ok" : ""}`}>{marketRiskLabel(draft.riskStatus)}</span>
              </div>
              <div className="ly-bar"><span style={{ width: readinessMessage ? "68%" : "100%" }} /></div>
            </div>

            {decision ? (
              <div className="ly-insight">
                <div className="ly-insight-orb" />
                <div>
                  <span className="ly-status ok">{routeStatusLabel(decision.status)}</span>
                  <h3>{decision.recommendedAction === "launch_native" ? "This can become a NexMarkets market." : "A route was found."}</h3>
                  <p>{publicMarketText(decision.reason)}</p>
                  {market ? <Link className="primary" href={`/market/${market.id}`}>Open Market Room</Link> : null}
                </div>
              </div>
            ) : null}

            <div className="ly-work">
              <main className="ly-list">
                <article className="ly-approval">
                  <div className="ly-approval-top">
                    <div>
                      <span className="ly-status ok">Market question</span>
                      <h3>{draft.question}</h3>
                      <p>{draft.rawThesis}</p>
                    </div>
                  </div>
                  <div className="ly-summary">
                    <div className="ly-summary-row"><span>Arena</span><b>{toTitleLabel(draft.arena)}</b></div>
                    <div className="ly-summary-row"><span>Style</span><b>{marketTemplateLabel(draft.template)}</b></div>
                    <div className="ly-summary-row"><span>Timeframe</span><b>{timeframeLabel(draft)}</b></div>
                    <div className="ly-summary-row"><span>Source</span><b>{draft.settlementSource ?? draft.resolution.sourceName ?? "Needs source"}</b></div>
                  </div>
                </article>

                <article className="ly-approval">
                  <div className="ly-approval-top">
                    <div>
                      <span className="ly-status">Ride / Fade</span>
                      <h3>Sides and resolution.</h3>
                    </div>
                  </div>
                  <div className="ly-summary">
                    <div className="ly-summary-row"><span>Ride</span><b>{draft.sides.ride}</b></div>
                    <div className="ly-summary-row"><span>Fade</span><b>{draft.sides.fade}</b></div>
                    <div className="ly-summary-row"><span>Resolution</span><b>{draft.resolution.method}</b></div>
                    <div className="ly-summary-row"><span>Fallback</span><b>{draft.resolution.fallback}</b></div>
                  </div>
                  {readinessMessage ? <div className="ly-nudge show">{readinessMessage}</div> : null}
                </article>

                {decision ? (
                  <article className="ly-approval">
                    <div className="ly-approval-top">
                      <div>
                        <span className="ly-status ok">Market fit</span>
                        <h3>Route decision.</h3>
                        <p>{publicMarketText(decision.reason)}</p>
                      </div>
                    </div>
                    <div className="ly-summary">
                      {[...decision.polymarketCandidates, ...decision.nativeCandidates].map((candidate) => (
                        <div className="ly-summary-row" key={`${candidate.origin}:${candidate.id}`}>
                          <span>{marketOriginDetail(candidate.origin)}</span>
                          <b>{candidate.title} - {(candidate.confidence * 100).toFixed(0)}%</b>
                        </div>
                      ))}
                      {!decision.polymarketCandidates.length && !decision.nativeCandidates.length ? <div className="ly-summary-row"><span>Matches</span><b>No close market was found.</b></div> : null}
                    </div>
                  </article>
                ) : null}
              </main>

              <aside className="ly-side">
                <section className="ly-preview">
                  <span className="ly-live-kicker">Preview</span>
                  <h3>{draft.title}</h3>
                  <p>{draft.question}</p>
                  <div className="ly-preview-grid">
                    <div><span>Arena</span><b>{toTitleLabel(draft.arena)}</b></div>
                    <div><span>Style</span><b>{marketTemplateLabel(draft.template)}</b></div>
                    <div><span>Close</span><b>{timeframeLabel(draft)}</b></div>
                    <div><span>Source</span><b>{draft.settlementSource ?? "Needed"}</b></div>
                  </div>
                </section>

                <section className="ly-earn">
                  <h3>Launch stake</h3>
                  <p>$10 launch fee and $10 quality bond.</p>
                  <span className="big">$20</span>
                </section>

                <section className="v40-ticket">
                  <h3>Launch Market</h3>
                  <div className="v40-summary">
                    <div><span>Launch stake</span><b>$20 USDC</b></div>
                    <div><span>Fee</span><b>$10</b></div>
                    <div><span>Quality bond</span><b>$10</b></div>
                    <div><span>Wallet</span><b>{shortHash(address)}</b></div>
                    <div><span>Balance</span><b>{formatUsdcUnits(balanceQuery.data)} USDC</b></div>
                    <div><span>Approval</span><b>{hasLaunchAllowance ? "Approved" : `${formatUsdcUnits(launchAllowance)} USDC`}</b></div>
                    <div><span>Market style</span><b>{templateStatus}</b></div>
                  </div>
                  {launchBlockedReason ? <p className="v40-risk">{launchBlockedReason}</p> : null}
                  {!hasLaunchBalance && address ? <p className="v40-risk">You need 20 USDC before launch.</p> : null}
                  {!address ? (
                    <button className="execute" type="button" disabled={launchBusy} onClick={connectWalletForLaunch}>Connect Wallet</button>
                  ) : (
                    <>
                      <button className="btn execute-secondary" type="button" disabled={launchBusy || Boolean(launchBlockedReason) || hasLaunchAllowance || !hasLaunchBalance} onClick={approveLaunchStake}>
                        {hasLaunchAllowance ? "Stake Approved" : approving ? "Approving..." : "Approve $20 Stake"}
                      </button>
                      <button className="execute" type="button" disabled={launchBusy || Boolean(launchBlockedReason) || !hasLaunchAllowance || !hasLaunchBalance} onClick={launchNativeMarket}>
                        {launching ? "Launching..." : "Launch Market"}
                      </button>
                    </>
                  )}
                  <p className="v40-risk">Launch only when the question, deadline and source are clear enough for traders to judge.</p>
                </section>
              </aside>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
