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
  fetchTrendingThesesApi,
  routeCheckApi,
  shapeMarketApi,
  syncNativeMarketEventsApi
} from "@/lib/services/nexid-client";
import type { NexMarket, RouteDecision, ShapedMarketDraft } from "@/lib/types/nexmarkets";

const arenaOptions = ["crypto", "football", "culture"] as const;
type TrendingThesis = Awaited<ReturnType<typeof fetchTrendingThesesApi>>[number];

const launchIdeas = [
  ["Crypto", "A chain leads weekly DEX volume", "Metric market"],
  ["AI", "A model tops a public benchmark", "Benchmark market"],
  ["Sports", "A team wins its next match", "Match market"],
  ["Culture", "A creator trend reaches #1", "Ranking market"],
  ["Crypto", "A token closes above a target", "Price-close market"],
  ["AI", "A product ships before quarter end", "Launch market"],
  ["Sports", "A club qualifies this season", "Season market"],
  ["Culture", "A narrative enters the top trend list", "Trend market"]
] as const;

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
  if (draft.sourceQualification?.launchBlocked) {
    return draft.sourceQualification.launchBlockReason ?? "Source qualification blocked this market launch.";
  }
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

function inferArenaHint(value: string): (typeof arenaOptions)[number] {
  if (/team|match|score|league|qualify|wins?|playoff|club|football|fifa|uefa|sports?/i.test(value)) return "football";
  if (/creator|meme|culture|movie|song|viral|trend|chart|award|album/i.test(value)) return "culture";
  return "crypto";
}

function LaunchStream({ side }: { side: "left" | "right" }) {
  const cards = (suffix: string) => launchIdeas.map(([category, title, summary]) => (
    <article className="ly-idea" key={`${suffix}:${category}:${title}`}>
      <small>{category}</small>
      <b>{title}</b>
      <span>{summary}</span>
    </article>
  ));

  return (
    <aside className={`ly-rail ${side}`} aria-hidden="true">
      <div className="ly-stream">
        <div className="ly-track">{cards("a")}</div>
        <div className="ly-track">{cards("b")}</div>
      </div>
    </aside>
  );
}

function LaunchAiPanel() {
  const steps = [
    "Reading your narrative",
    "Checking existing markets",
    "Shaping the market question",
    "Drafting result logic"
  ];

  return (
    <div className="ly-ai">
      <div className="ly-ai-head">
        <div>
          <h3>NexMind is preparing it.</h3>
          <p>It is checking routes, shaping the question and drafting rules traders can understand.</p>
        </div>
        <div className="ly-orb" />
      </div>
      <div className="ly-ai-steps">
        {steps.map((step, index) => (
          <div className={`ly-ai-step ${index === 0 ? "active" : ""}`} key={step}>
            <i>{index === 0 ? "..." : "."}</i>
            <b>{step}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function scorePercent(value: number | null | undefined) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

function sourceCheckLabel(value: number | undefined, max: number) {
  if (value === max) return "Pass";
  if ((value ?? 0) > 0) return "Partial";
  return "Fail";
}

function sourceQualificationLabel(draft: ShapedMarketDraft) {
  const report = draft.sourceQualification;
  if (!report) return "Not checked";
  if (report.launchBlocked) return "Blocked";
  if (report.status === "DOWNGRADED") return "Evidence-Based";
  if (report.settlementMode === "auto_verifiable") return "Auto-Verifiable";
  return "Evidence-Based";
}

function evidenceBasedByDesign(draft: ShapedMarketDraft) {
  const report = draft.sourceQualification;
  return Boolean(
    report &&
    report.settlementMode === "evidence_based" &&
    report.status !== "DOWNGRADED" &&
    report.extractorValidationStatus === "not_required" &&
    report.dryRunStatus === "not_required"
  );
}

function SourceQualificationPanel({ draft }: { draft: ShapedMarketDraft }) {
  const report = draft.sourceQualification;
  if (!report) {
    return (
      <article className="ly-approval ly-source-quality">
        <div className="ly-approval-top">
          <div>
            <span className="ly-status">Source quality</span>
            <h3>Qualification pending.</h3>
            <p>NexMind will validate the source, extractor and dry run before launch.</p>
          </div>
        </div>
      </article>
    );
  }

  if (evidenceBasedByDesign(draft)) {
    return (
      <article className="ly-approval ly-source-quality evidence">
        <div className="ly-approval-top">
          <div>
            <span className="ly-status ok">Source Quality</span>
            <h3>Evidence-Based</h3>
            <p>Public source locked. Automated extraction is not required for this market type.</p>
          </div>
          <div className="ly-path-badge">
            <b>ProofFlow</b>
            <span>Evidence review</span>
          </div>
        </div>

        <div className="ly-source-ready">
          <div><span>Source</span><b>Locked</b></div>
          <div><span>Extractor</span><b>Not required</b></div>
          <div><span>Dry run</span><b>Not required</b></div>
        </div>

        <div className="ly-summary ly-source-summary">
          <div className="ly-summary-row"><span>Source chosen</span><b>{report.sourceUrl ?? draft.resolution.sourceName ?? "Locked evidence source"}</b></div>
          <div className="ly-summary-row"><span>Settlement path</span><b>Evidence-Based ProofFlow</b></div>
          <div className="ly-summary-row"><span>Verification</span><b>Evidence is checked against the locked source and rules after the market closes.</b></div>
        </div>
      </article>
    );
  }

  const checks = [
    ["Reachability", report.componentScores.reachability, 20],
    ["Structured data", report.componentScores.structuredData, 25],
    ["Stability", report.componentScores.stability, 20],
    ["Determinism", report.componentScores.determinism, 25],
    ["Timestamp support", report.componentScores.timestampSupport, 10]
  ] as const;
  const mode = sourceQualificationLabel(draft);
  const statusClass = report.launchBlocked ? "" : report.status === "ACCEPT" || report.status === "DOWNGRADED" || report.status === "EVIDENCE_BASED" ? "ok" : "";

  return (
    <article className="ly-approval ly-source-quality">
      <div className="ly-approval-top">
        <div>
          <span className={`ly-status ${statusClass}`}>Source Quality</span>
          <h3>{mode}</h3>
          <p>{report.reasoning[0] ?? "NexMind checked the source before launch."}</p>
        </div>
        <div className="ly-score-orb">
          <b>{Math.round(report.score)}</b>
          <span>/100</span>
        </div>
      </div>

      <div className="ly-source-grid">
        {checks.map(([label, value, max]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{sourceCheckLabel(value, max)}</b>
            <em>{value}/{max}</em>
          </div>
        ))}
      </div>

      <div className="ly-summary ly-source-summary">
        <div className="ly-summary-row"><span>Source score</span><b>{Math.round(report.score)} / 100</b></div>
        <div className="ly-summary-row"><span>Source chosen</span><b>{report.sourceUrl ?? "Evidence review"}</b></div>
        <div className="ly-summary-row"><span>Extractor validation</span><b>{report.extractorValidationStatus} - {report.extractorValidationReason}</b></div>
        <div className="ly-summary-row"><span>Dry run settlement</span><b>{report.dryRunStatus}{report.dryRunResult?.provisionalOutcome ? ` - ${String(report.dryRunResult.provisionalOutcome).toUpperCase()}` : ""}</b></div>
        <div className="ly-summary-row"><span>Settlement path</span><b>{mode}</b></div>
      </div>

      {report.repairAttempts.length ? (
        <div className="ly-repair-log">
          {report.repairAttempts.map((attempt, index) => (
            <div key={`${attempt.sourceUrl ?? "none"}:${index}`}>
              <span>{attempt.status}</span>
              <b>{attempt.sourceUrl ?? "No replacement found"}</b>
              <p>{attempt.reason}{typeof attempt.score === "number" ? ` Score ${attempt.score}/100.` : ""}</p>
            </div>
          ))}
        </div>
      ) : null}

      {report.status === "DOWNGRADED" ? (
        <div className="ly-nudge show">Auto-verifiable checks failed, so NexMind moved this market to evidence-based ProofFlow settlement.</div>
      ) : null}
      {report.launchBlocked ? <div className="ly-nudge show">{report.launchBlockReason}</div> : null}
    </article>
  );
}

function TrendingThesisStrip({
  theses,
  loading,
  onSelect
}: {
  theses: TrendingThesis[];
  loading: boolean;
  onSelect: (thesis: TrendingThesis) => void;
}) {
  return (
    <section className="ly-trends" aria-label="Trending theses">
      <div className="ly-trends-head">
        <div>
          <span>Trending theses</span>
          <b>NexMind launch ideas</b>
        </div>
        <small>{loading ? "Loading" : theses.length ? `${theses.length} live` : "None yet"}</small>
      </div>
      {theses.length ? (
        <div className="ly-trend-row">
          {theses.slice(0, 6).map((item) => (
            <button className="ly-trend-card" key={item.id} type="button" onClick={() => onSelect(item)}>
              <span>{toTitleLabel(item.arena)}</span>
              <b>{item.title}</b>
              <em>{scorePercent(item.measurabilityScore)} measurable</em>
            </button>
          ))}
        </div>
      ) : (
        <p>{loading ? "Fetching live thesis ideas." : "No active trending theses have been generated yet. Run the trending job to populate this feed."}</p>
      )}
    </section>
  );
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
  const [launchTxHash, setLaunchTxHash] = useState<Hex | null>(null);
  const [launchedMarketId, setLaunchedMarketId] = useState<string | null>(null);
  const [confirmedLaunchAllowance, setConfirmedLaunchAllowance] = useState<bigint | null>(null);
  const [trendingTheses, setTrendingTheses] = useState<TrendingThesis[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(true);

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

  useEffect(() => {
    let active = true;
    setLoadingTrends(true);
    fetchTrendingThesesApi(8)
      .then((items) => {
        if (!active) return;
        setTrendingTheses(items);
      })
      .catch(() => {
        if (!active) return;
        setTrendingTheses([]);
      })
      .finally(() => {
        if (active) setLoadingTrends(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
  const launchedMarket = market && launchedMarketId === market.id ? market : null;
  const launchConfirmed = Boolean(launchedMarketId);
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
    : draft.sourceQualification?.launchBlocked
        ? draft.sourceQualification.launchBlockReason ?? "Source qualification blocked this market launch."
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

  async function prepareMarket() {
    setLoading(true);
    setMessage("");
    setDecision(null);
    setMarket(null);
    setTxHash(null);
    setLaunchTxHash(null);
    setLaunchedMarketId(null);
    try {
      const nextArenaHint = inferArenaHint(rawThesis) ?? arenaHint;
      setArenaHint(nextArenaHint);
      const response = await shapeMarketApi({ rawThesis, arenaHint: nextArenaHint });
      const routeResponse = await routeCheckApi({ draftId: response.draftId, draft: response.draft });
      setDraftId(response.draftId);
      setDraft(response.draft);
      setDecision(routeResponse.decision);
      setMarket(routeResponse.market);
      setMessage(publicMarketText(routeResponse.decision.reason));
    } catch (error) {
      setMessage(error instanceof Error ? publicMarketText(error.message) : "Could not prepare market.");
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
    if (!draft) return;
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
        draftId: draftId ?? undefined,
        draft,
        walletAddress: user.walletAddress,
        chainId: nativeChainId,
        closeTime: Number(closeTime)
      });
      setMarket(nativeResponse.market);

      if (nativeResponse.market.contractAddress) {
        setLaunchedMarketId(nativeResponse.market.id);
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
      setLaunchTxHash(hash);
      const receipt = await waitForTransaction(hash);
      if (receipt.status !== "success") {
        throw new Error("The launch did not complete. No market was created.");
      }
      setLaunchedMarketId(nativeResponse.market.id);

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

  function selectTrendingThesis(thesis: TrendingThesis) {
    setRawThesis(thesis.thesis || thesis.title);
    const arena = thesis.arena === "football" || thesis.arena === "culture" ? thesis.arena : "crypto";
    setArenaHint(arena);
    setMessage("Trending thesis loaded. Prepare it when ready.");
  }

  return (
    <section id="launch" className="view active">
      <div className="ly-root">
        <div className="ly-hero">
          <LaunchStream side="left" />

          <section className="ly-card">
            <div className="ly-top">
              <span className="ly-pill"><i /> NexMind: AI launch copilot</span>
              <span className="ly-note">NexMarkets</span>
            </div>
            <h1>Launch what you believe.</h1>
            <p className="ly-lead">Bring a narrative. NexMind makes it tradable.</p>
            <div className="ly-inputbox">
              <label className="ly-label" htmlFor="launch-thesis"><span>What narrative should become a market?</span><span>{rawThesis.length}/180</span></label>
              <textarea
                id="launch-thesis"
                className="ly-thesis"
                maxLength={180}
                value={rawThesis}
                onChange={(event) => setRawThesis(event.target.value)}
                placeholder="Example: Open-source AI agents become the hottest crypto narrative this week."
              />
              <div className="ly-actions">
                <span className="ly-hint">Prepare market lets NexMind shape the idea before you approve anything.</span>
                <button className="primary" type="button" disabled={loading || rawThesis.trim().length < 4} onClick={prepareMarket}>
                  {loading ? "Preparing..." : "Prepare market"}
                </button>
              </div>
              <TrendingThesisStrip theses={trendingTheses} loading={loadingTrends} onSelect={selectTrendingThesis} />
              {loading ? <LaunchAiPanel /> : null}
            </div>
            {message ? <div className="wallet-note"><b>Status:</b> {message}</div> : null}
            {txHash ? (
              <Link className="btn" href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer">
                View Transaction {shortHash(txHash)}
              </Link>
            ) : null}
          </section>

          <LaunchStream side="right" />
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

                <SourceQualificationPanel draft={draft} />

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
                  <h3>{launchConfirmed ? "Market Launched" : "Launch Market"}</h3>
                  <div className="v40-summary">
                    <div><span>Launch stake</span><b>{launchConfirmed ? "$20 paid" : "$20 USDC"}</b></div>
                    <div><span>Fee</span><b>$10</b></div>
                    <div><span>Quality bond</span><b>$10</b></div>
                    <div><span>Wallet</span><b>{shortHash(address)}</b></div>
                    <div><span>Balance</span><b>{formatUsdcUnits(balanceQuery.data)} USDC</b></div>
                    <div><span>Approval</span><b>{launchConfirmed ? "Consumed" : hasLaunchAllowance ? "Approved" : `${formatUsdcUnits(launchAllowance)} USDC`}</b></div>
                    <div><span>Market style</span><b>{launchConfirmed ? "Launched" : templateStatus}</b></div>
                  </div>
                  {launchConfirmed ? (
                    <>
                      <div className="ly-nudge show">
                        {launchedMarket?.contractAddress
                          ? "Launch confirmed. The market room is ready."
                          : "Launch confirmed. The market room is indexing and may take a moment to show the contract address."}
                      </div>
                      {launchTxHash ? (
                        <Link className="btn execute-secondary" href={`https://sepolia.basescan.org/tx/${launchTxHash}`} target="_blank" rel="noreferrer">
                          View launch transaction
                        </Link>
                      ) : null}
                      {launchedMarket ? <Link className="execute" href={`/market/${launchedMarket.id}`}>Open Market Room</Link> : null}
                    </>
                  ) : !address ? (
                    <button className="execute" type="button" disabled={launchBusy} onClick={connectWalletForLaunch}>Connect Wallet</button>
                  ) : (
                    <>
                      {launchBlockedReason ? <p className="v40-risk">{launchBlockedReason}</p> : null}
                      {!hasLaunchBalance ? <p className="v40-risk">You need 20 USDC before launch.</p> : null}
                      <button className="btn execute-secondary" type="button" disabled={launchBusy || Boolean(launchBlockedReason) || hasLaunchAllowance || !hasLaunchBalance} onClick={approveLaunchStake}>
                        {hasLaunchAllowance ? "Stake Approved" : approving ? "Approving..." : "Approve $20 Stake"}
                      </button>
                      <button className="execute" type="button" disabled={launchBusy || Boolean(launchBlockedReason) || !hasLaunchAllowance || !hasLaunchBalance} onClick={launchNativeMarket}>
                        {launching ? "Launching..." : "Launch Market"}
                      </button>
                    </>
                  )}
                  <p className="v40-risk">{launchConfirmed ? "The $20 launch stake has been processed onchain." : "Launch only when the question, deadline and source are clear enough for traders to judge."}</p>
                </section>
              </aside>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
