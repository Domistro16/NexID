"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { zeroAddress, zeroHash, type Hex } from "viem";
import { useWalletSession } from "@/components/nexid/shared/wallet-session";
import { waitForAllowanceConfirmation } from "@/lib/client/approval-confirmation";
import { userFacingTransactionError } from "@/lib/client/transaction-error";
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

const arenaOptions = ["crypto", "football", "culture", "ai"] as const;
type TrendingThesis = Awaited<ReturnType<typeof fetchTrendingThesesApi>>[number];

const launchIdeas = [
  ["Crypto", "Which chain leads DEX volume?", "Volume metric"],
  ["AI", "Which model tops the benchmark?", "Benchmark rank"],
  ["Sports", "Which team wins the match?", "Match result"],
  ["Culture", "Which creator trend hits #1?", "Chart ranking"],
  ["Crypto", "Which token closes above target?", "Price-close market"],
  ["AI", "Which product ships this quarter?", "Create market"],
  ["Sports", "Which club qualifies this season?", "Season market"],
  ["Culture", "Which topic reaches the trend list?", "Trend ranking"]
] as const;

const cats = ["Crypto", "Sports", "Culture", "AI"];

function shortHash(value: string | null | undefined) {
  if (!value) return "-";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
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

function dateInput(d: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function pretty(v: string) {
  const d = new Date(v);
  if (String(d) === "Invalid Date") return v || "Not set";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function money(n: number) {
  return "$" + Number(n || 0).toFixed(2).replace(/\.00$/, "");
}

function parts(v: string) {
  const d = new Date(v);
  const ok = String(d) !== "Invalid Date";
  return {
    y: ok ? d.getFullYear() : new Date().getFullYear(),
    m: ok ? d.getMonth() : new Date().getMonth(),
    day: ok ? d.getDate() : new Date().getDate(),
    h: ok ? d.getHours() : 23,
    min: ok ? d.getMinutes() : 59
  };
}

function makeDT(y: number, m: number, d: number, h: number, min: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m + 1)}-${pad(d)}T${pad(h)}:${pad(min)}`;
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
              {item.measurabilityScore !== null && item.measurabilityScore !== undefined ? (
                <em>{Math.round(Number(item.measurabilityScore) * 100)}% measurable</em>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <p>{loading ? "Fetching live thesis ideas." : "No active trending theses have been generated yet. Run the trending job to populate this feed."}</p>
      )}
    </section>
  );
}

function LaunchAiPanel({ aiStep }: { aiStep: number }) {
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
        {steps.map((step, index) => {
          let cls = "ly-ai-step";
          if (index < aiStep) cls += " done";
          else if (index === aiStep) cls += " active";
          return (
            <div className={cls} key={step}>
              <i>{index < aiStep ? "✓" : "…"}</i>
              <b>{step}</b>
            </div>
          );
        })}
      </div>
    </div>
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

  // Flow Stages: "entry" | "thinking" | "route" | "drafting" | "review" | "payment" | "success"
  const [stage, setStage] = useState<"entry" | "thinking" | "route" | "drafting" | "review" | "payment" | "success">("entry");
  const [aiStep, setAiStep] = useState(0);

  // Editable draft states
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("Crypto");
  const [verify, setVerify] = useState("");
  const [winner, setWinner] = useState("");
  const [fallback, setFallback] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [checkingSource, setCheckingSource] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [closeAt, setCloseAt] = useState("");

  const [approved, setApproved] = useState({
    question: false,
    verify: false,
    winner: false,
    timing: false,
    integrity: false
  });
  const [openCard, setOpenCard] = useState<"question" | "verify" | "winner" | "timing" | "integrity" | null>(null);
  const [routeOverride, setRouteOverride] = useState(false);

  // Timepicker temporary states
  const [tmpActive, setTmpActive] = useState<"startAt" | "closeAt">("closeAt");
  const [tmpStartAt, setTmpStartAt] = useState("");
  const [tmpCloseAt, setTmpCloseAt] = useState("");
  const [tmpMonth, setTmpMonth] = useState<number>(new Date().getMonth());
  const [tmpYear, setTmpYear] = useState<number>(new Date().getFullYear());

  // Payment states
  const [payment, setPayment] = useState<"wallet" | "edge" | "split">("split");
  const [confirmedTerms, setConfirmedTerms] = useState(false);
  const [showNudge, setShowNudge] = useState(false);

  // Refs for tracking API status during preparation
  const apiResultRef = useRef<{ draftId: string | null; draft: ShapedMarketDraft; decision: RouteDecision; market: NexMarket | null } | null>(null);
  const apiErrorRef = useRef<string | null>(null);

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
  const launchedMarket = market && launchedMarketId === market.id ? market : null;
  const launchConfirmed = Boolean(launchedMarketId);
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

  const candidates = useMemo(() => {
    return decision ? [...decision.polymarketCandidates, ...decision.nativeCandidates] : [];
  }, [decision]);

  const hasMatch = useMemo(() => {
    if (!decision) return false;
    return decision.recommendedAction !== "launch_native" && candidates.length > 0;
  }, [decision, candidates]);

  const isTimingValid = useMemo(() => {
    const dStart = new Date(startAt);
    const dClose = new Date(closeAt);
    return String(dStart) !== "Invalid Date" && String(dClose) !== "Invalid Date" && dClose > dStart;
  }, [startAt, closeAt]);

  const launchBlockedReason = !draft
    ? "Shape a market first."
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [stage]);

  async function prepareMarket() {
    if (rawThesis.trim().length < 4) return;
    setLoading(true);
    setMessage("");
    setDecision(null);
    setMarket(null);
    setTxHash(null);
    setLaunchTxHash(null);
    setLaunchedMarketId(null);
    setStage("thinking");
    setAiStep(0);

    let currentStep = 0;
    let apiFinished = false;
    let apiSuccess = false;
    apiErrorRef.current = null;
    apiResultRef.current = null;

    const checkComplete = () => {
      if (currentStep >= 4 && apiFinished) {
        setLoading(false);
        if (apiSuccess && apiResultRef.current) {
          const res = apiResultRef.current;
          setDraftId(res.draftId);
          setDraft(res.draft);
          setDecision(res.decision);
          setMarket(res.market);

          setQuestion(res.draft.question);

          let mappedCat = "Crypto";
          if (/football|sports?/i.test(res.draft.arena)) mappedCat = "Sports";
          else if (/ai|agent|model/i.test(res.draft.arena)) mappedCat = "AI";
          else if (/culture|meme/i.test(res.draft.arena)) mappedCat = "Culture";
          setCategory(mappedCat);

          setVerify(res.draft.settlementSource || res.draft.resolution.sourceName || "");
          setSourceUrl(res.draft.resolution.sourceUrl || "");
          setWinner(res.draft.resolution.method || "");
          setFallback(res.draft.resolution.fallback || "");
          setStartAt(res.draft.timeframe?.startAt || dateInput(new Date(Date.now() + 60 * 60 * 1000)));
          setCloseAt(res.draft.timeframe?.closeAt || dateInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
          setApproved({
            question: false,
            verify: false,
            winner: false,
            timing: false,
            integrity: false
          });
          setConfirmedTerms(false);
          setRouteOverride(false);

          setStage("route");
          setMessage(publicMarketText(res.decision.reason));
        } else {
          setMessage(publicMarketText(apiErrorRef.current || "Could not prepare market."));
          setStage("entry");
        }
      }
    };

    const interval = setInterval(() => {
      currentStep++;
      setAiStep(currentStep);
      if (currentStep >= 4) {
        clearInterval(interval);
        checkComplete();
      }
    }, 620);

    try {
      const nextArenaHint = inferArenaHint(rawThesis) ?? arenaHint;
      setArenaHint(nextArenaHint);
      const response = await shapeMarketApi({ rawThesis, arenaHint: nextArenaHint });
      const routeResponse = await routeCheckApi({ draftId: response.draftId, draft: response.draft });
      apiResultRef.current = {
        draftId: response.draftId,
        draft: response.draft,
        decision: routeResponse.decision,
        market: routeResponse.market
      };
      apiSuccess = true;
    } catch (error) {
      apiErrorRef.current = error instanceof Error ? error.message : "Could not prepare market.";
      apiSuccess = false;
    } finally {
      apiFinished = true;
      checkComplete();
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
      setMessage("Approval transaction confirmed. Waiting for Base to reflect the launch allowance.");
      setConfirmedLaunchAllowance(LAUNCH_STAKE_USDC);
      const confirmation = await waitForAllowanceConfirmation({
        requiredAllowance: LAUNCH_STAKE_USDC,
        readAllowance: () => publicClient.readContract({
          address: addresses.collateral!,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address ?? zeroAddress, addresses.factory!]
        }),
        onRetry: () => setMessage("Approval confirmed onchain. Base is still reflecting the launch allowance.")
      });
      setConfirmedLaunchAllowance(confirmation.reflected ? confirmation.allowance : LAUNCH_STAKE_USDC);
      await Promise.all([allowanceQuery.refetch(), balanceQuery.refetch()]);
      setMessage(confirmation.reflected
        ? "Launch stake approved. You can launch the market now."
        : `Approval confirmed onchain. Base has not reflected the launch allowance read yet; latest read is ${formatUsdcUnits(confirmation.allowance)} USDC. You can try launching now or wait a few seconds and refresh.`);
    } catch (error) {
      setMessage(userFacingTransactionError(error, "Approval failed."));
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

      const updatedDraft: ShapedMarketDraft = {
        ...draft,
        question,
        arena: category.toLowerCase() === "sports" ? "football" : (category.toLowerCase() as any),
        settlementSource: verify,
        resolution: {
          ...draft.resolution,
          method: winner,
          fallback,
          sourceName: verify,
          sourceUrl: sourceUrl.trim() || null
        },
        timeframe: {
          ...draft.timeframe,
          startAt,
          closeAt,
          timezone: draft.timeframe?.timezone || "UTC",
          label: pretty(closeAt)
        } as any
      };

      const closeTimestamp = Math.floor(new Date(closeAt).getTime() / 1000);
      const closeTime = Number.isFinite(closeTimestamp) && closeTimestamp > Math.floor(Date.now() / 1000)
        ? BigInt(closeTimestamp)
        : defaultNativeCloseTime();

      const nativeResponse = await createNativeMarketApi({
        draftId: draftId ?? undefined,
        draft: updatedDraft,
        walletAddress: user.walletAddress,
        chainId: nativeChainId,
        closeTime: Number(closeTime)
      });
      setMarket(nativeResponse.market);

      if (nativeResponse.market.contractAddress) {
        setLaunchedMarketId(nativeResponse.market.id);
        setMessage("This market is already live.");
        setStage("success");
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
        setStage("success");
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
      setStage("success");
    } catch (error) {
      setMessage(userFacingTransactionError(error, "Market launch failed."));
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

  const integrityList = useMemo(() => {
    const qClean = question.trim();
    const sClean = verify.trim();
    const wClean = winner.trim();
    const fClean = fallback.trim();

    const isMeasurable = qClean && wClean ? "Pass" : "Needs review";
    const isNeutral = / (guaranteed|obvious|sure|pump|dump|moon|dead) /i.test(question) ? "Needs review" : "Pass";
    const isSourceQuality = sClean.length > 32 ? "Pass" : "Needs review";
    const isDuplicate = hasMatch && !routeOverride ? "Needs review" : "Pass";
    const isManipulation = /creator|my post|my tweet|private|admin/i.test(sClean + wClean) ? "Needs review" : "Pass";
    const isFallbackClarity = fClean.length > 28 ? "Pass" : "Needs review";
    const isTimingClarity = isTimingValid ? "Pass" : "Needs review";

    return [
      { name: "Measurable", status: isMeasurable, desc: "Outcome can be checked against a clear event, number or public result." },
      { name: "Neutral wording", status: isNeutral, desc: "Question avoids pushing Ride or Fade." },
      { name: "Source quality", status: isSourceQuality, desc: "Traders can see where the result will be checked." },
      { name: "Duplicate risk", status: isDuplicate, desc: hasMatch ? "Similar route found. Continue only if this angle is different." : "No obvious duplicate route detected." },
      { name: "Manipulation risk", status: isManipulation, desc: "Outcome is not controlled by the creator." },
      { name: "Fallback clarity", status: isFallbackClarity, desc: "Fallback explains what happens when the source fails." },
      { name: "Timing clarity", status: isTimingClarity, desc: "Start and close time are valid and reviewable." }
    ];
  }, [question, verify, winner, fallback, startAt, closeAt, hasMatch, routeOverride, isTimingValid]);

  const integritySummary = useMemo(() => {
    const pass = integrityList.filter(x => x.status === "Pass").length;
    const total = integrityList.length;
    const needs = total - pass;
    return { pass, total, needs };
  }, [integrityList]);

  const progressData = useMemo(() => {
    const c = [
      approved.question && Boolean(question),
      approved.verify && Boolean(verify),
      approved.winner && Boolean(winner),
      approved.timing && isTimingValid,
      approved.integrity
    ];
    const done = c.filter(Boolean).length;
    const total = c.length;
    const pct = Math.round((done / total) * 100);
    return { done, total, pct };
  }, [approved, question, verify, winner, isTimingValid]);

  const reviewBlockerMessage = useMemo(() => {
    if (!question || !approved.question) return "Review and approve the public market question.";
    if (!verify || !approved.verify) return "Review and approve where traders will verify the result.";
    if (!winner || !approved.winner) return "Review and approve how the winner is decided.";
    if (!isTimingValid || !approved.timing) return "Review and approve valid start and close times.";
    if (!approved.integrity) return "Review and approve the market integrity check.";
    return "Ready to proceed.";
  }, [question, verify, winner, isTimingValid, approved]);

  const isReviewReady = reviewBlockerMessage === "Ready to proceed.";

  const walletBalanceNum = balanceQuery.data ? Number(balanceQuery.data) / 1e6 : 0;
  const edgeBalanceNum = 64.00;

  const payOptions = useMemo(() => {
    return {
      wallet: {
        label: "Wallet balance",
        sub: `Available ${money(walletBalanceNum)}`,
        ok: walletBalanceNum >= 20
      },
      edge: {
        label: "EdgeBoard rewards",
        sub: `Available ${money(edgeBalanceNum)}`,
        ok: edgeBalanceNum >= 20
      },
      split: {
        label: "EdgeBoard + wallet",
        sub: "Use EdgeBoard rewards first, then wallet",
        ok: (walletBalanceNum + edgeBalanceNum) >= 20
      }
    };
  }, [walletBalanceNum, edgeBalanceNum]);

  function handlePreset(preset: "today" | "tomorrow" | "7d" | "30d") {
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    let close = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (preset === "today") {
      close = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
      if (close <= start) {
        close = new Date(start.getTime() + 6 * 60 * 60 * 1000);
      }
    } else if (preset === "tomorrow") {
      close = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59);
    } else if (preset === "30d") {
      close = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    const sStr = dateInput(start);
    const cStr = dateInput(close);
    setTmpStartAt(sStr);
    setTmpCloseAt(cStr);
    setTmpActive("closeAt");
    setTmpMonth(close.getMonth());
    setTmpYear(close.getFullYear());
  }

  function handleMonthChange(delta: number) {
    let m = tmpMonth + delta;
    let y = tmpYear;
    if (m < 0) {
      m = 11;
      y--;
    }
    if (m > 11) {
      m = 0;
      y++;
    }
    setTmpMonth(m);
    setTmpYear(y);
  }

  function handlePickDate(y: number, m: number, d: number) {
    if (tmpActive === "startAt") {
      const p = parts(tmpStartAt);
      setTmpStartAt(makeDT(y, m, d, p.h, p.min));
    } else {
      const p = parts(tmpCloseAt);
      setTmpCloseAt(makeDT(y, m, d, p.h, p.min));
    }
  }

  function handleSetClock(part: "h" | "min", val: number) {
    if (tmpActive === "startAt") {
      const p = parts(tmpStartAt);
      if (part === "h") p.h = val;
      if (part === "min") p.min = val;
      setTmpStartAt(makeDT(p.y, p.m, p.day, p.h, p.min));
    } else {
      const p = parts(tmpCloseAt);
      if (part === "h") p.h = val;
      if (part === "min") p.min = val;
      setTmpCloseAt(makeDT(p.y, p.m, p.day, p.h, p.min));
    }
  }

  function handleTimeDone() {
    setStartAt(tmpStartAt);
    setCloseAt(tmpCloseAt);
    setApproved(prev => ({ ...prev, timing: false }));
    setOpenCard(null);
  }

  function toggleCard(card: "question" | "verify" | "winner" | "timing" | "integrity") {
    if (card === "timing" && openCard !== "timing") {
      setTmpStartAt(startAt);
      setTmpCloseAt(closeAt);
      setTmpActive("closeAt");
      const p = parts(closeAt);
      setTmpMonth(p.m);
      setTmpYear(p.y);
    }
    setOpenCard(prev => (prev === card ? null : card));
  }

  function handleEditSourceUrl(val: string) {
    setSourceUrl(val);
    setApproved(prev => ({ ...prev, verify: false }));
  }

  async function handleApproveCard(key: "question" | "verify" | "winner" | "timing" | "integrity") {
    if (key === "question" && !question) return;
    if (key === "winner" && !winner) return;
    if (key === "timing" && !isTimingValid) return;
    if (key === "verify") {
      if (!verify) return;
      setCheckingSource(true);
      setMessage("Checking source qualification...");
      try {
        const response = await fetch("/api/qualify-source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft: {
              ...draft,
              settlementSource: verify,
              resolution: {
                ...draft!.resolution,
                method: winner,
                fallback,
                sourceName: verify,
                sourceUrl: sourceUrl.trim() || null
              }
            }
          })
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const res = await response.json();
        const nextDraft = res.draft;
        setDraft(nextDraft);
        setVerify(nextDraft.settlementSource || nextDraft.resolution.sourceName || "");
        setSourceUrl(nextDraft.resolution.sourceUrl || "");
        setFallback(nextDraft.resolution.fallback || "");
        if (nextDraft.settlementMode === "evidence_based") {
          setMessage("Source is not auto-verifiable. Switched to ProofFlow evidence-based settlement.");
        } else {
          setMessage("Source is auto-verifiable. Auto-resolution enabled.");
        }
      } catch (e) {
        console.error("Qualify error:", e);
        setMessage("Source check failed. Switched to manual ProofFlow resolution.");
        if (draft) {
          setDraft({
            ...draft,
            settlementMode: "evidence_based",
            resolution: {
              ...draft.resolution,
              sourceType: "manual_optimistic"
            }
          });
        }
      } finally {
        setCheckingSource(false);
      }
    }
    setApproved(prev => ({ ...prev, [key]: true }));
    setOpenCard(null);
  }

  function handleEditQuestion(val: string) {
    setQuestion(val);
    setApproved(prev => ({ ...prev, question: false }));
  }

  function handleEditCategory(val: string) {
    setCategory(val);
    setApproved(prev => ({ ...prev, question: false }));
  }

  function handleEditVerify(val: string) {
    setVerify(val);
    setApproved(prev => ({ ...prev, verify: false }));
  }

  function handleEditFallback(val: string) {
    setFallback(val);
    setApproved(prev => ({ ...prev, verify: false }));
  }

  function handleEditWinner(val: string) {
    setWinner(val);
    setApproved(prev => ({ ...prev, winner: false }));
  }

  function handleContinueDraft(force: boolean) {
    setRouteOverride(force);
    setOpenCard(null);

    if (!force && !hasMatch) {
      setStage("drafting");
      setAiStep(0);
      let step = 0;
      const interval = setInterval(() => {
        step++;
        setAiStep(step);
        if (step >= 5) {
          clearInterval(interval);
          setStage("review");
        }
      }, 1000);
      return;
    }
    setStage("review");
  }

  function handlePayOrCreate() {
    if (!confirmedTerms) {
      setShowNudge(true);
      return;
    }
    launchNativeMarket();
  }

  function handleShareX() {
    const txt = encodeURIComponent(`I just launched a market on NexMarkets: ${question}`);
    const url = encodeURIComponent(`https://nexmarkets.app/market/${launchedMarketId}`);
    window.open(`https://twitter.com/intent/tweet?text=${txt}&url=${url}`, "_blank");
  }

  function handleResetLaunch() {
    setRawThesis("");
    setDraftId(null);
    setDraft(null);
    setDecision(null);
    setMarket(null);
    setTxHash(null);
    setLaunchTxHash(null);
    setLaunchedMarketId(null);
    setSourceUrl("");
    setStage("entry");
    setAiStep(0);
  }

  // Memoized calendar logic
  const activeValCalendar = tmpActive === "startAt" ? tmpStartAt : tmpCloseAt;
  const activeParts = parts(activeValCalendar);

  const calendarData = useMemo(() => {
    const monthDate = new Date(tmpYear, tmpMonth, 1);
    const firstDay = monthDate.getDay();
    const totalDays = new Date(tmpYear, tmpMonth + 1, 0).getDate();
    const prevMonthTotalDays = new Date(tmpYear, tmpMonth, 0).getDate();

    const cells = [];
    const selected = parts(activeValCalendar);

    for (let i = 0; i < 42; i++) {
      let day = i - firstDay + 1;
      let isOut = false;
      let m = tmpMonth;
      let y = tmpYear;

      if (day < 1) {
        day = prevMonthTotalDays + day;
        isOut = true;
        m = tmpMonth - 1;
        if (m < 0) {
          m = 11;
          y--;
        }
      } else if (day > totalDays) {
        day = day - totalDays;
        isOut = true;
        m = tmpMonth + 1;
        if (m > 11) {
          m = 0;
          y++;
        }
      }

      const isSelected = day === selected.day && m === selected.m && y === selected.y;
      cells.push({ day, isOut, isSelected, m, y });
    }

    const monthName = monthDate.toLocaleString("en-US", { month: "long", year: "numeric" });
    return { monthName, cells };
  }, [tmpYear, tmpMonth, activeValCalendar]);

  function renderApprovalCard(
    key: "question" | "verify" | "winner" | "timing" | "integrity",
    title: string,
    desc: string,
    rows: [string, string][],
    editor: React.ReactNode
  ) {
    const isApproved = approved[key];
    const isOpen = openCard === key;

    return (
      <section className="ly-approval" key={key}>
        <div className="ly-approval-top">
          <div>
            <span className={`ly-status ${isApproved ? "ok" : ""}`}>
              {isApproved ? "Approved" : "Needs review"}
            </span>
            <h3>{title}</h3>
            <p>{desc}</p>
          </div>
          <div className="ly-mini-actions">
            <button className="btn" type="button" onClick={() => toggleCard(key)}>
              {isOpen ? "Close" : "Edit"}
            </button>
            <button
              className="primary"
              type="button"
              disabled={checkingSource && key === "verify"}
              onClick={() => handleApproveCard(key)}
            >
              {checkingSource && key === "verify" ? "Checking..." : isApproved ? "Approved" : "Approve"}
            </button>
          </div>
        </div>
        <div className="ly-summary">
          {rows.map(([label, val], idx) => (
            <div className="ly-summary-row" key={idx}>
              <span>{label}</span>
              <b>{val}</b>
            </div>
          ))}
        </div>
        <div className={`ly-editor ${isOpen ? "show" : ""}`}>{editor}</div>
      </section>
    );
  }

  return (
    <section id="launch" className="view active">
      <div className="ly-root">
        {stage === "entry" && (
          <div className="ly-hero">
            <LaunchStream side="left" />
            <main className="ly-card">
              <div className="ly-top">
                <span className="ly-pill"><i />NexMind: Market draft helper</span>
                <span className="ly-note">NexMarkets</span>
              </div>
              <h1>Turn your idea into a market.</h1>
              <p className="ly-lead">Describe the outcome. NexMind drafts the rules.</p>
              <div className="ly-inputbox">
                <div className="ly-label">
                  <span>What outcome should people trade?</span>
                  <span>{rawThesis.length}/180</span>
                </div>
                <textarea
                  id="lyThesis"
                  className="ly-thesis"
                  maxLength={180}
                  value={rawThesis}
                  onChange={(e) => setRawThesis(e.target.value)}
                  placeholder="Example: Open-source AI agents become the hottest crypto narrative this week."
                />
                <div className="ly-actions">
                  <span className="ly-hint">
                    NexMind drafts the question, rules and source before approval.
                  </span>
                  <button
                    className="primary"
                    type="button"
                    disabled={loading || rawThesis.trim().length < 4}
                    onClick={prepareMarket}
                  >
                    {loading ? "Preparing..." : "Draft market"}
                  </button>
                </div>
                {loading && <LaunchAiPanel aiStep={aiStep} />}
              </div>
              {message && <div className="wallet-note"><b>Status:</b> {message}</div>}
              {txHash && (
                <Link className="btn" href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer">
                  View Transaction {shortHash(txHash)}
                </Link>
              )}
            </main>
            <LaunchStream side="right" />
          </div>
        )}

        {stage === "thinking" && (
          <div className="ly-hero">
            <div className="ly-rail left" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden="true" />
            <main className="ly-card">
              <div className="ly-top">
                <span className="ly-pill"><i />NexMind: Market draft helper</span>
                <span className="ly-note">NexMarkets</span>
              </div>
              <h1>Turn your idea into a market.</h1>
              <p className="ly-lead">Describe the outcome. NexMind drafts the rules.</p>
              <div className="ly-inputbox">
                <div className="ly-label">
                  <span>What outcome should people trade?</span>
                  <span>{rawThesis.length}/180</span>
                </div>
                <textarea
                  id="lyThesis"
                  className="ly-thesis"
                  maxLength={180}
                  disabled
                  value={rawThesis}
                  placeholder="Example: Open-source AI agents become the hottest crypto narrative this week."
                />
                <div className="ly-actions">
                  <span className="ly-hint">
                    NexMind drafts the question, rules and source before approval.
                  </span>
                  <button className="primary" type="button" disabled>
                    Preparing...
                  </button>
                </div>
                <LaunchAiPanel aiStep={aiStep} />
              </div>
              {message && <div className="wallet-note"><b>Status:</b> {message}</div>}
            </main>
            <div className="ly-rail right" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden="true" />
          </div>
        )}

        {stage === "route" && (
          <div className="ly-hero">
            <div className="ly-rail left" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden="true" />
            <main className="ly-route-card">
              <div className="ly-top">
                <span className="ly-pill"><i />Route check</span>
                <span className="ly-note">Before launch</span>
              </div>
              {hasMatch ? (
                <>
                  <h2>Markets already exist for this thesis.</h2>
                  <p>
                    NexMind found similar routes. Trade one if it matches your thesis, or continue only if your angle is meaningfully different.
                  </p>
                  <div className="ly-route-options">
                    {candidates.map((c, i) => (
                      <article className="ly-route-option" key={`${c.origin}:${c.id}:${i}`}>
                        <b>{c.title}</b>
                        <span>
                          {c.origin === "polymarket" ? "Polymarket" : "NexMarkets"} · {toTitleLabel(arenaHint)} · Match {(c.confidence * 100).toFixed(0)}%
                        </span>
                        {c.origin === "polymarket" ? (
                          <a className="btn" href={`https://polymarket.com/event/${c.id}`} target="_blank" rel="noreferrer">
                            Trade this route
                          </a>
                        ) : (
                          <Link className="btn" href={`/market/${c.id}`}>
                            Trade this route
                          </Link>
                        )}
                      </article>
                    ))}
                  </div>
                  <div className="ly-route-actions">
                    <button className="primary" type="button" onClick={() => handleContinueDraft(true)}>
                      Launch a different version
                    </button>
                    <button className="btn" type="button" onClick={() => setStage("entry")}>
                      Edit thesis
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2>No clean market found.</h2>
                  <div className="ly-route-empty">
                    <b>No market for this thesis yet.</b>
                    <span>NexMind can turn it into a native draft you review before launch.</span>
                  </div>
                  <div className="ly-route-actions">
                    <button className="primary" type="button" onClick={() => handleContinueDraft(false)}>
                      Proceed to launch one
                    </button>
                    <button className="btn" type="button" onClick={() => setStage("entry")}>
                      Edit thesis
                    </button>
                  </div>
                </>
              )}
            </main>
            <div className="ly-rail right" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden="true" />
          </div>
        )}

        {stage === "drafting" && (
          <div className="ly-hero">
            <div className="ly-rail left" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden="true" />
            <main className="ly-draft-card">
              <div className="ly-top">
                <span className="ly-pill"><i />NexMind draft</span>
                <span className="ly-note">5-second build</span>
              </div>
              <h2>Building your native market draft.</h2>
              <p>
                NexMind is populating the question, source, timing and fallback before you review anything.
              </p>
              <div className="ly-draft-visual">
                <div className="ly-draft-orbit">
                  <i className="ly-draft-line a"></i>
                  <i className="ly-draft-line b"></i>
                  <i className="ly-draft-line c"></i>
                  <b className="ly-draft-core"></b>
                  <span className="ly-draft-pill one">Question</span>
                  <span className="ly-draft-pill two">Source</span>
                  <span className="ly-draft-pill three">Timing</span>
                  <span className="ly-draft-pill four">Fallback</span>
                </div>
                <div className="ly-draft-steps">
                  {["Question", "Source", "Timing", "Fallback", "Integrity"].map((step, idx) => {
                    let cls = "ly-draft-step";
                    if (idx < aiStep) cls += " done";
                    else if (idx === aiStep) cls += " active";
                    return (
                      <div className={cls} key={step}>
                        {idx < aiStep ? "✓ " : ""}
                        {step}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="ly-hint">
                This creates the draft only. You still approve the final market before payment.
              </p>
            </main>
            <div className="ly-rail right" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden="true" />
          </div>
        )}

        {stage === "review" && (
          <section className="ly-review">
            <div className="ly-review-head">
              <div className="ly-review-title">
                <div>
                  <h2>Review the market.</h2>
                  <p>NexMind prepared a cleaner draft. Review the cards and continue when the market is clear.</p>
                </div>
                <span className="ly-pill"><i />{progressData.done}/{progressData.total} ready</span>
              </div>
              <div className="ly-bar"><span style={{ width: `${progressData.pct}%` }}></span></div>
              {routeOverride && (
                <div className="ly-match">
                  <h3>Launching a different version.</h3>
                  <p>
                    A similar route was found. Continue only because this version has a different angle, source, time window or resolution rule.
                  </p>
                </div>
              )}
            </div>

            {/* Insight panel */}
            <section className="ly-insight">
              <div className="ly-insight-orb" />
              <div>
                <div className="ly-cleaned-label">What NexMind cleaned</div>
                <div className="ly-insight-grid">
                  <div className="ly-insight-item">
                    <b>Question cleaned</b>
                    <span>Turned the narrative into a tradable yes/no market.</span>
                  </div>
                  <div className="ly-insight-item">
                    <b>Category picked</b>
                    <span>{category} was selected from the thesis.</span>
                  </div>
                  <div className="ly-insight-item">
                    <b>Rule drafted</b>
                    <span>Added plain-English settlement logic.</span>
                  </div>
                  <div className="ly-insight-item">
                    <b>Time window found</b>
                    <span>The review starts with a suggested market window.</span>
                  </div>
                </div>
              </div>
            </section>

            <div className="ly-work">
              <div className="ly-list">
                {renderApprovalCard(
                  "question",
                  "Public market question",
                  "This is the headline traders will see. Keep it clear and measurable.",
                  [
                    ["Question", question || "Missing"],
                    ["Category", category]
                  ],
                  <>
                    <div className="ly-field">
                      <label>Market question</label>
                      <textarea
                        value={question}
                        onChange={(e) => handleEditQuestion(e.target.value)}
                      />
                    </div>
                    <div className="ly-field">
                      <label>Category</label>
                      <div className="ly-chip-row">
                        {cats.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`ly-chip ${category === c ? "active" : ""}`}
                            onClick={() => handleEditCategory(c)}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {renderApprovalCard(
                  "verify",
                  "Where traders verify the result",
                  "This tells traders where the final result comes from.",
                  [
                    ["Result check", verify || "Missing"],
                    ["Source URL", sourceUrl || "None (optional)"],
                    ["Fallback", fallback]
                  ],
                  <>
                    <div className="ly-field">
                      <label>
                        Where will traders verify the result?{" "}
                        <em className="ly-info">
                           i
                           <span>
                             Use the clearest public place traders can check after close: dashboard, exchange page, official result, API snapshot or scoreboard.
                           </span>
                        </em>
                      </label>
                      <textarea
                        value={verify}
                        onChange={(e) => handleEditVerify(e.target.value)}
                      />
                    </div>
                    <div className="ly-field">
                      <label>Source URL (optional)</label>
                      <textarea
                        style={{ minHeight: "42px", height: "42px", resize: "none" }}
                        value={sourceUrl}
                        onChange={(e) => handleEditSourceUrl(e.target.value)}
                        placeholder="e.g. https://www.coingecko.com/en/coins/ethereum"
                      />
                    </div>
                    <div className="ly-field">
                      <label>If the result cannot be verified</label>
                      <textarea
                        value={fallback}
                        onChange={(e) => handleEditFallback(e.target.value)}
                      />
                    </div>
                    {draft?.settlementMode === "evidence_based" && (
                      <div className="ly-route-empty" style={{ marginTop: "12px", border: "1px dashed var(--line)", padding: "12px", borderRadius: "10px" }}>
                        <b style={{ color: "#ffb000" }}>ProofFlow Settlement</b>
                        <span style={{ fontSize: "13px", display: "block", color: "var(--muted)", marginTop: "4px" }}>
                          This source URL is not auto-verifiable or was left blank. Resolution will be managed via public evidence and ProofFlow reviewer consensus.
                        </span>
                      </div>
                    )}
                    {draft?.sourceQualification && draft.settlementMode === "auto_verifiable" && (
                      <div style={{ marginTop: "12px", border: "1px dashed var(--line)", padding: "12px", borderRadius: "10px" }}>
                        <small style={{ color: "var(--muted)", display: "block", marginBottom: "6px" }}>NexMind Source Quality Check:</small>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
                          <span>Score: <b>{Math.round(draft.sourceQualification.score)}/100</b></span>
                          <span>Settlement: <b>Auto (Verifiable)</b></span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {renderApprovalCard(
                  "winner",
                  "How the winner is decided",
                  "One plain rule that removes argument at settlement.",
                  [["Winner rule", winner || "Missing"]],
                  <div className="ly-field">
                    <label>
                      Winner rule{" "}
                      <em className="ly-info">
                        i
                        <span>
                          Say exactly what event, number, price, rank or metric decides the market and when it is measured.
                        </span>
                      </em>
                    </label>
                    <textarea
                      value={winner}
                      onChange={(e) => handleEditWinner(e.target.value)}
                    />
                  </div>
                )}

                {renderApprovalCard(
                  "timing",
                  "Start and close time",
                  "Choose a date and time that make settlement clear.",
                  [
                    ["Starts", pretty(startAt)],
                    ["Closes", pretty(closeAt)]
                  ],
                  <div className="ly-timebox">
                    <div className="ly-time-title">
                      <div>
                        <b>NexTime</b>
                        <span>Choose start and close. Pick a date, set the time, then press Done.</span>
                      </div>
                      <span className="ly-pill"><i />Timing</span>
                    </div>
                    <div className="ly-time-quick">
                      <button type="button" className="ly-chip" onClick={() => handlePreset("today")}>Today</button>
                      <button type="button" className="ly-chip" onClick={() => handlePreset("tomorrow")}>Tomorrow</button>
                      <button type="button" className="ly-chip" onClick={() => handlePreset("7d")}>7 days</button>
                      <button type="button" className="ly-chip" onClick={() => handlePreset("30d")}>30 days</button>
                    </div>
                    <div className="ly-date-tabs">
                      <button
                        type="button"
                        className={`ly-date-tab ${tmpActive === "startAt" ? "active" : ""}`}
                        onClick={() => {
                          setTmpActive("startAt");
                          const p = parts(tmpStartAt);
                          setTmpMonth(p.m);
                          setTmpYear(p.y);
                        }}
                      >
                        <span>Starts</span>
                        <b>{pretty(tmpStartAt)}</b>
                      </button>
                      <button
                        type="button"
                        className={`ly-date-tab ${tmpActive === "closeAt" ? "active" : ""}`}
                        onClick={() => {
                          setTmpActive("closeAt");
                          const p = parts(tmpCloseAt);
                          setTmpMonth(p.m);
                          setTmpYear(p.y);
                        }}
                      >
                        <span>Closes</span>
                        <b>{pretty(tmpCloseAt)}</b>
                      </button>
                    </div>
                    <div className="ly-time-picker">
                      <div className="ly-calendar">
                        <div className="ly-cal-head">
                          <b>{calendarData.monthName}</b>
                          <div className="ly-cal-nav">
                            <button type="button" onClick={() => handleMonthChange(-1)}>‹</button>
                            <button type="button" onClick={() => handleMonthChange(1)}>›</button>
                          </div>
                        </div>
                        <div className="ly-days-head">
                          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                            <span key={i}>{d}</span>
                          ))}
                        </div>
                        <div className="ly-days">
                          {calendarData.cells.map((cell, idx) => {
                            let cls = "ly-day";
                            if (cell.isOut) cls += " out";
                            if (cell.isSelected) cls += " selected";
                            return (
                              <button
                                key={idx}
                                type="button"
                                className={cls}
                                onClick={() => handlePickDate(cell.y, cell.m, cell.day)}
                              >
                                {cell.day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <aside className="ly-time-side">
                        <div>
                          <h4>{tmpActive === "startAt" ? "Start time" : "Close time"}</h4>
                          <p style={{ margin: "5px 0 0", color: "var(--muted)", fontSize: "12px", lineHeight: 1.35 }}>
                            Set the exact time for the selected date.
                          </p>
                        </div>
                        <div className="ly-time-fields">
                          <label>
                            Hour
                            <select
                              value={activeParts.h}
                              onChange={(e) => handleSetClock("h", Number(e.target.value))}
                            >
                              {Array.from({ length: 24 }, (_, i) => (
                                <option key={i} value={i}>
                                  {String(i).padStart(2, "0")}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Minute
                            <select
                              value={Math.round(activeParts.min / 5) * 5}
                              onChange={(e) => handleSetClock("min", Number(e.target.value))}
                            >
                              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((i) => (
                                <option key={i} value={i}>
                                  {String(i).padStart(2, "0")}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="ly-time-summary">
                          <span>Selected</span>
                          <b>{pretty(activeValCalendar)}</b>
                        </div>
                        <div className="ly-time-done">
                          <button className="primary" type="button" onClick={handleTimeDone}>
                            Done
                          </button>
                        </div>
                      </aside>
                    </div>
                  </div>
                )}

                {renderApprovalCard(
                  "integrity",
                  "Market integrity check",
                  "NexMind checks market structure only. You cannot edit this score directly; edit the draft fields and re-check.",
                  [
                    ["Integrity score", `${integritySummary.pass}/${integritySummary.total} checks pass`],
                    ["Result", "Review before launch"]
                  ],
                  <div className="ly-integrity-box">
                    <div className="ly-integrity-score">
                      <div>
                        <strong>
                          Market Integrity: {integritySummary.pass}/{integritySummary.total} checks passed
                        </strong>
                        <span>NexMind checks structure only. Edit the draft fields to improve this score.</span>
                      </div>
                      <span className="ly-pill">
                        <i />
                        {integritySummary.needs ? `${integritySummary.needs} need review` : "Ready"}
                      </span>
                    </div>
                    <div className="ly-integrity-list">
                      {integrityList.map((item, idx) => (
                        <div className={`ly-integrity-row ${item.status === "Pass" ? "ok" : "warn"}`} key={idx}>
                          <b>{item.name}</b>
                          <span>{item.status}</span>
                          <details className="ly-integrity-detail" style={{ gridColumn: "1/-1" }}>
                            <summary>Why this matters</summary>
                            <p>{item.desc}</p>
                          </details>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <aside className="ly-side">
                <section className="ly-preview">
                  <span className="ly-pill"><i />Market preview</span>
                  <h3>{question || "Your market question appears here"}</h3>
                  <p>{rawThesis || "Start with your narrative. NexMind turns it into a clean market draft."}</p>
                  <div className="ly-preview-grid">
                    <div><span>Category</span><b>{category}</b></div>
                    <div><span>Close</span><b>{pretty(closeAt)}</b></div>
                    <div><span>Result check</span><b>{(verify || "Missing").slice(0, 76)}</b></div>
                    <div><span>Creator fee</span><b>1% volume</b></div>
                    <div><span>Stake</span><b>$20 fixed</b></div>
                    <div><span>Status</span><b>{isReviewReady ? "Ready" : "Needs review"}</b></div>
                  </div>
                </section>

                <section className="ly-earn">
                  <h3>Monetize your thesis.</h3>
                  <p>When traders use the market, the creator fee line belongs to you.</p>
                  <span className="big">1%</span>
                  <p>of trading volume</p>
                </section>

                <button
                  className="primary ly-launch"
                  type="button"
                  disabled={!isReviewReady}
                  onClick={() => setStage("payment")}
                >
                  {isReviewReady ? "I’m ready to launch" : "Finish review first"}
                </button>
                <div className="ly-blocker">{reviewBlockerMessage}</div>
              </aside>
            </div>

            <div className="ly-bottom">
              <div>
                <strong>{isReviewReady ? "Ready for launch" : "Launch progress"}</strong>
                <span>{progressData.done}/{progressData.total} checks complete</span>
              </div>
              <button
                className="primary"
                type="button"
                disabled={!isReviewReady}
                onClick={() => setStage("payment")}
              >
                Continue
              </button>
            </div>
          </section>
        )}

        {stage === "payment" && (
          <section className="ly-pay-page">
            <main className="ly-pay-main">
              <span className="ly-pill"><i />Final launch step</span>
              <h2>One step from live.</h2>
              <p>Launch it and start earning from trading fees.</p>
              <div className="ly-pay-options">
                {Object.entries(payOptions).map(([key, opt]) => {
                  let cls = "ly-pay-option";
                  if (payment === key) cls += " active";
                  if (!opt.ok) cls += " off";
                  return (
                    <div
                      className={cls}
                      key={key}
                      onClick={() => {
                        if (opt.ok) setPayment(key as any);
                      }}
                    >
                      <b>{opt.label}</b>
                      <span>{opt.sub}</span>
                      <strong>{opt.ok ? "Available" : "Not enough"}</strong>
                    </div>
                  );
                })}
              </div>

              <div className="ly-fee">
                <h3>$20 fixed launch stake</h3>
                <div className="ly-fee-row">
                  <span>Launch fee</span>
                  <b>$10</b>
                </div>
                <div className="ly-fee-row">
                  <span>Quality bond</span>
                  <b>$10 locked</b>
                </div>
                <div className="ly-fee-row">
                  <span>Creator earnings</span>
                  <b>1% of volume</b>
                </div>
                <p className="ly-treasury">
                  A portion of platform revenue funds NexMind compute, source monitoring, market data and ecosystem growth.
                </p>
              </div>

              <div id="lyNudge" className={`ly-nudge ${showNudge ? "show" : ""}`}>
                Confirm the responsibility box to unlock launch.
              </div>

              <label className="ly-confirm">
                <input
                  type="checkbox"
                  checked={confirmedTerms}
                  onChange={(e) => {
                    setConfirmedTerms(e.target.checked);
                    setShowNudge(false);
                  }}
                />
                <div>
                  <b>I agree to the launch terms and accept responsibility for this market.</b>
                  <span>
                    I confirm the question, result check, winner rule and timing are final, visible to traders and locked at launch.
                  </span>
                </div>
              </label>

              {message && <div className="wallet-note"><b>Status:</b> {message}</div>}

              <div className="ly-pay-actions">
                <button
                  className="btn"
                  type="button"
                  disabled={launchBusy}
                  onClick={() => setStage("review")}
                >
                  Back
                </button>

                {!confirmedTerms ? (
                  <button
                    className="primary disabled"
                    type="button"
                    onClick={() => setShowNudge(true)}
                  >
                    Create market
                  </button>
                ) : !address ? (
                  <button
                    className="primary"
                    type="button"
                    disabled={launchBusy}
                    onClick={connectWalletForLaunch}
                  >
                    Connect Wallet
                  </button>
                ) : !hasLaunchAllowance ? (
                  <button
                    className="primary"
                    type="button"
                    disabled={launchBusy || !hasLaunchBalance}
                    onClick={approveLaunchStake}
                  >
                    {approving ? "Approving..." : "Approve $20 Stake"}
                  </button>
                ) : (
                  <button
                    className="primary"
                    type="button"
                    disabled={launchBusy}
                    onClick={handlePayOrCreate}
                  >
                    {launching ? "Launching..." : "Launch Market"}
                  </button>
                )}
              </div>
            </main>

            <aside>
              <section className="ly-final-preview">
                <span className="ly-pill"><i />Final market card</span>
                <h3>{question}</h3>
                <p>{rawThesis}</p>
                <div className="ly-preview-grid">
                  <div><span>Category</span><b>{category}</b></div>
                  <div><span>Closes</span><b>{pretty(closeAt)}</b></div>
                  <div><span>Result check</span><b>{(verify || "Verified source").slice(0, 78)}</b></div>
                  <div><span>Creator fee</span><b>1% volume</b></div>
                  <div><span>Stake</span><b>$20 fixed</b></div>
                  <div><span>Status</span><b>Ready</b></div>
                </div>
              </section>
            </aside>
          </section>
        )}

        {stage === "success" && (
          <section className="ly-success">
            <article className="ly-live-card">
              <div className="ly-live-top">
                <div className="ly-live-logo">
                  <span className="mark">
                    <svg viewBox="0 0 40 40" aria-hidden="true" style={{ width: "24px", height: "24px" }}>
                      <path d="M9 31V9h7.2l11.5 14.4V9H31v22h-7.1L12.3 16.5V31H9z" fill="#ffb000" />
                    </svg>
                  </span>
                  NexMarkets
                </div>
                <span className="ly-live-kicker">Market open</span>
              </div>
              <div className="ly-live-main">
                <h2>Your thesis is live.</h2>
                <p>
                  A tradable market is now live with locked rules, integrity review and creator earnings attached.
                </p>
                <div className="ly-live-question">
                  <span>Live market question</span>
                  <b>{question}</b>
                </div>
              </div>
              <div className="ly-live-grid">
                <div><span>Market ID</span><b>{launchedMarketId || "NM-#####"}</b></div>
                <div><span>Creator fee</span><b>1% volume</b></div>
                <div><span>Launch stake</span><b>$20 fixed</b></div>
                <div><span>Integrity</span><b>{integritySummary.pass}/{integritySummary.total} reviewed</b></div>
              </div>
            </article>

            <aside className="ly-success-side">
              <div>
                <span className="ly-pill"><i />Creator market</span>
                <h3>Share it. Track it. Earn from volume.</h3>
                <p>
                  Visit the market, share your launch receipt, or open creator alerts to monitor source and close-time updates.
                </p>
              </div>
              <div className="ly-success-actions">
                {launchedMarketId ? (
                  <Link className="primary" href={`/market/${launchedMarketId}`}>
                    View market
                  </Link>
                ) : (
                  <button className="primary" type="button" disabled>
                    View market
                  </button>
                )}
                <button className="btn" type="button" onClick={handleShareX}>
                  Share launch receipt
                </button>
                <Link className="btn" href="/dashboard">
                  Open creator alerts
                </Link>
                <button className="btn" type="button" onClick={handleResetLaunch}>
                  Launch another
                </button>
              </div>
            </aside>
          </section>
        )}
      </div>
    </section>
  );
}
