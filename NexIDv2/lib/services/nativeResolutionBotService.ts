import { createPublicClient, createWalletClient, formatEther, http, parseAbi, type Address, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { requireDatabase } from "@/lib/server/db";
import { syncNativeMarketFactoryEvents } from "@/lib/services/nativeMarketIndexerService";
import { verifyClosedNativeMarketResults } from "@/lib/services/nativeResultVerificationService";
import {
  closeExpiredProofFlowMarkets,
  executeProofFlowRefundQueue,
  finalizeExpiredProofFlowMarkets,
  processOpenProofFlowReviews,
  processProofFlowReceiptHashJobs,
  submitProofFlowProvisional
} from "@/lib/services/proofFlowService";

const resolutionManagerAbi = parseAbi([
  "function closeMarket(address market)",
  "function proposeResult(address market,uint8 winner)",
  "function disputeResult(address market)",
  "function finalizeUndisputed(address market)",
  "function finalizeDisputed(address market,uint8 winner,bool invalid)",
  "function markInvalid(address market)",
  "function proposals(address market) view returns (uint8 winner,address proposer,uint256 proposedAt,bool disputed,bool finalized)",
  "function RESOLVER_ROLE() view returns (bytes32)",
  "function DISPUTER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role,address account) view returns (bool)"
]);

const nativeBinaryMarketAbi = parseAbi([
  "function status() view returns (uint8)",
  "function RESOLUTION_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role,address account) view returns (bool)"
]);

const NATIVE_STATUS = {
  LivePendingOpen: 0,
  TradingLive: 1,
  Closed: 2,
  ResultProposed: 3,
  Disputed: 4,
  Settled: 5,
  InvalidRefund: 6,
  CancelledBeforeTrading: 7
} as const;

type BotAction =
  | "wallet_gas_check"
  | "role_check"
  | "close_market"
  | "verify_result"
  | "proof_flow_finalize"
  | "proof_flow_review"
  | "proof_flow_onchain_settlement"
  | "sync_events";

type BotResult = {
  action: BotAction;
  marketId?: string;
  manager?: string;
  ok: boolean;
  txHash?: string;
  outcome?: "ride" | "fade" | "invalid" | "needs_review";
  status?: string;
  confidence?: number;
  detail?: string;
};

type BotRunInput = {
  chainId?: number;
  limit?: number;
  force?: boolean;
  sync?: boolean;
};

type NativeResolutionMarket = {
  id: string;
  origin?: string;
  status?: string;
  chainId: number | null;
  contractAddress: string | null;
  resolutionManagerAddress: string | null;
};

function configuredAddress(value?: string | null): Address | null {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value as Address;
}

function privateKey() {
  const raw = process.env.NATIVE_RESOLUTION_BOT_PRIVATE_KEY;
  if (!raw) throw new Error("NATIVE_RESOLUTION_BOT_PRIVATE_KEY is required for the native resolution bot.");
  return raw.startsWith("0x") ? raw as Hex : `0x${raw}` as Hex;
}

function chainConfig(chainId: number): { chain: Chain; rpcUrl?: string } {
  if (chainId === 84532) return { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL };
  if (chainId === 8453) return { chain: base, rpcUrl: process.env.BASE_RPC_URL };
  throw new Error("Unsupported native market chain.");
}

function resolutionManagerAddress() {
  const address = configuredAddress(process.env.NATIVE_RESOLUTION_MANAGER_ADDRESS);
  if (!address) throw new Error("NATIVE_RESOLUTION_MANAGER_ADDRESS is required for the native resolution bot.");
  return address;
}

function marketResolutionManager(market: Pick<NativeResolutionMarket, "resolutionManagerAddress">, fallbackManager: Address) {
  return configuredAddress(market.resolutionManagerAddress) ?? fallbackManager;
}

function defaultChainId() {
  return Number(process.env.NATIVE_EVENTS_CHAIN_ID || process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID || 84532);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function isRateLimitError(error: unknown) {
  const message = errorMessage(error);
  return /\b429\b|rate.?limit|too many requests|quota/i.test(message);
}

function rateLimitedResult(input: { action: BotAction; marketId?: string; manager?: string; detail: string }): BotResult {
  return {
    action: input.action,
    marketId: input.marketId,
    manager: input.manager,
    ok: true,
    status: "rate_limited",
    detail: `Rate limited; will retry on the next bot run. ${input.detail}`
  };
}

function minimumBotGasWei() {
  const configured = process.env.NATIVE_RESOLUTION_MIN_GAS_WEI;
  if (!configured) return BigInt("100000000000000");
  try {
    return BigInt(configured);
  } catch {
    return BigInt("100000000000000");
  }
}

async function clients(chainId: number) {
  const config = chainConfig(chainId);
  if (!config.rpcUrl) throw new Error(`RPC URL is not configured for chain ${chainId}.`);
  const account = privateKeyToAccount(privateKey());
  const pollingInterval = Number(process.env.NATIVE_RESOLUTION_RPC_POLLING_MS || 12000);
  const transport = http(config.rpcUrl, {
    retryCount: 1,
    retryDelay: 2500,
    timeout: 25000
  });
  const publicClient = createPublicClient({ chain: config.chain, transport, pollingInterval });
  const walletClient = createWalletClient({ account, chain: config.chain, transport, pollingInterval });
  return { account, publicClient, walletClient };
}

async function checkBotGas(input: {
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  accountAddress: Address;
  chainId: number;
}): Promise<BotResult> {
  const balance = await input.publicClient.getBalance({ address: input.accountAddress });
  const minimum = minimumBotGasWei();
  if (balance >= minimum) {
    return {
      action: "wallet_gas_check",
      ok: true,
      status: "ready",
      detail: `Bot wallet ${input.accountAddress} has ${formatEther(balance)} native gas on chain ${input.chainId}.`
    };
  }
  return {
    action: "wallet_gas_check",
    ok: false,
    status: "needs_gas",
    detail: `Bot wallet ${input.accountAddress} has ${formatEther(balance)} native gas on chain ${input.chainId}. Fund this wallet with Base ETH before on-chain close writes can run. Minimum configured threshold is ${formatEther(minimum)} ETH.`
  };
}

async function checkBotRoles(input: {
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  manager: Address;
  accountAddress: Address;
}): Promise<BotResult> {
  const resolverRole = await input.publicClient.readContract({
    address: input.manager,
    abi: resolutionManagerAbi,
    functionName: "RESOLVER_ROLE"
  });
  const hasResolverRole = await input.publicClient.readContract({
    address: input.manager,
    abi: resolutionManagerAbi,
    functionName: "hasRole",
    args: [resolverRole, input.accountAddress]
  });
  if (!hasResolverRole) {
    return {
      action: "role_check",
      ok: false,
      status: "missing_resolver_role",
      detail: `Bot wallet ${input.accountAddress} is missing RESOLVER_ROLE on ${input.manager}. Grant RESOLVER_ROLE before closeMarket can run.`
    };
  }
  return {
    action: "role_check",
    ok: true,
    status: "ready",
    detail: `Bot wallet ${input.accountAddress} has RESOLVER_ROLE on ${input.manager}.`
  };
}

async function checkResolutionWriteAccess(input: {
  action: BotAction;
  marketId: string;
  marketAddress: Address;
  manager: Address;
  accountAddress: Address;
  needsResolver?: boolean;
  needsDisputer?: boolean;
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
}): Promise<BotResult | null> {
  const resolutionRole = await input.publicClient.readContract({
    address: input.marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "RESOLUTION_ROLE"
  });
  const managerCanResolveMarket = await input.publicClient.readContract({
    address: input.marketAddress,
    abi: nativeBinaryMarketAbi,
    functionName: "hasRole",
    args: [resolutionRole, input.manager]
  });

  if (!managerCanResolveMarket) {
    return {
      action: input.action,
      marketId: input.marketId,
      manager: input.manager,
      ok: false,
      status: "manager_missing_market_resolution_role",
      detail: `Manager ${input.manager} does not have RESOLUTION_ROLE on market ${input.marketAddress}. This market was created with a different resolution manager or factory, so the bot refused to send a reverting write.`
    };
  }

  if (input.needsResolver) {
    const resolverRole = await input.publicClient.readContract({
      address: input.manager,
      abi: resolutionManagerAbi,
      functionName: "RESOLVER_ROLE"
    });
    const hasResolverRole = await input.publicClient.readContract({
      address: input.manager,
      abi: resolutionManagerAbi,
      functionName: "hasRole",
      args: [resolverRole, input.accountAddress]
    });
    if (!hasResolverRole) {
      return {
        action: input.action,
        marketId: input.marketId,
        manager: input.manager,
        ok: false,
        status: "missing_resolver_role",
        detail: `Bot wallet ${input.accountAddress} is missing RESOLVER_ROLE on manager ${input.manager}. Grant RESOLVER_ROLE before this market can be closed.`
      };
    }
  }

  if (input.needsDisputer) {
    const disputerRole = await input.publicClient.readContract({
      address: input.manager,
      abi: resolutionManagerAbi,
      functionName: "DISPUTER_ROLE"
    });
    const hasDisputerRole = await input.publicClient.readContract({
      address: input.manager,
      abi: resolutionManagerAbi,
      functionName: "hasRole",
      args: [disputerRole, input.accountAddress]
    });
    if (!hasDisputerRole) {
      return {
        action: input.action,
        marketId: input.marketId,
        manager: input.manager,
        ok: false,
        status: "missing_disputer_role",
        detail: `Bot wallet ${input.accountAddress} is missing DISPUTER_ROLE on manager ${input.manager}. Grant DISPUTER_ROLE before challenged ProofFlow markets can be mirrored onchain.`
      };
    }
  }

  return null;
}

async function recordResolutionError(marketId: string, message: string) {
  const db = requireDatabase();
  const existing = await db.marketResolution.findFirst({
    where: { marketId },
    orderBy: { updatedAt: "desc" }
  });
  if (!existing) {
    await db.marketResolution.create({
      data: { marketId, status: "bot_error", resolutionMode: "proofflow", lastError: message }
    });
    return;
  }
  await db.marketResolution.update({
    where: { id: existing.id },
    data: { lastError: message }
  });
}

async function recordResolutionPreflightFailure(result: BotResult) {
  if (!result.marketId || result.ok) return;
  const db = requireDatabase();
  const marketState = result.status === "manager_missing_market_resolution_role"
    ? "resolution_misconfigured"
    : "resolution_blocked";
  const resolutionStatus = marketState;
  const existing = await db.marketResolution.findFirst({
    where: { marketId: result.marketId },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) {
    await db.marketResolution.update({
      where: { id: existing.id },
      data: { status: resolutionStatus, resolutionMode: "proofflow", lastError: result.detail ?? result.status ?? "Resolution preflight failed." }
    });
  } else {
    await db.marketResolution.create({
      data: {
        marketId: result.marketId,
        status: resolutionStatus,
        resolutionMode: "proofflow",
        lastError: result.detail ?? result.status ?? "Resolution preflight failed."
      }
    });
  }
  await db.market.update({
    where: { id: result.marketId },
    data: { resolutionState: marketState }
  });
}

async function closeExpiredMarkets(input: {
  chainId: number;
  limit: number;
  fallbackManager: Address;
  accountAddress: Address;
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  walletClient: Awaited<ReturnType<typeof clients>>["walletClient"];
}) {
  const db = requireDatabase();
  const markets = await db.market.findMany({
    where: {
      origin: "native",
      chainId: input.chainId,
      contractAddress: { not: null },
      closeTime: { lte: new Date() },
      status: { in: ["trading_live", "live_pending_open"] }
    },
    orderBy: { closeTime: "asc" },
    take: input.limit
  });
  const results: BotResult[] = [];

  for (const market of markets) {
    let manager = input.fallbackManager;
    try {
      const marketAddress = configuredAddress(market.contractAddress);
      if (!marketAddress) throw new Error("Market contract address is invalid.");
      manager = marketResolutionManager(market, input.fallbackManager);
      const preflight = await checkResolutionWriteAccess({
        action: "close_market",
        marketId: market.id,
        marketAddress,
        manager,
        accountAddress: input.accountAddress,
        needsResolver: true,
        publicClient: input.publicClient
      });
      if (preflight) {
        await recordResolutionPreflightFailure(preflight).catch(() => undefined);
        results.push(preflight);
        continue;
      }

      const hash = await input.walletClient.writeContract({
        address: manager,
        abi: resolutionManagerAbi,
        functionName: "closeMarket",
        args: [marketAddress]
      });
      const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Close transaction failed.");
      await db.market.update({
        where: { id: market.id },
        data: { status: "closed", resolutionState: "closed", settlementStatus: "closed" }
      });
      const existingResolution = await db.marketResolution.findFirst({
        where: { marketId: market.id },
        orderBy: { updatedAt: "desc" }
      });
      if (existingResolution) {
        await db.marketResolution.update({
          where: { id: existingResolution.id },
          data: {
            status: existingResolution.status === "pending" ? "closed" : existingResolution.status,
            resolutionMode: existingResolution.resolutionMode === "legacy_uma_readonly" ? "legacy_uma_readonly" : "proofflow",
            settlementMode: existingResolution.settlementMode ?? market.settlementMode ?? "evidence_based",
            lastError: null
          }
        });
      } else {
        await db.marketResolution.create({
          data: { marketId: market.id, status: "closed", resolutionMode: "proofflow", settlementMode: market.settlementMode ?? "evidence_based" }
        });
      }
      await db.adminAuditLog.create({
        data: { action: "proof_flow_close_market", target: market.id, metadata: { txHash: hash, chainId: input.chainId, manager } as never }
      });
      results.push({ action: "close_market", marketId: market.id, manager, ok: true, txHash: hash });
    } catch (error) {
      const detail = errorMessage(error);
      if (isRateLimitError(error)) {
        results.push(rateLimitedResult({ action: "close_market", marketId: market.id, manager, detail }));
      } else {
        await recordResolutionError(market.id, detail).catch(() => undefined);
        results.push({ action: "close_market", marketId: market.id, manager, ok: false, detail });
      }
    }
  }

  return results;
}

function proofFlowSide(outcome?: string | null) {
  if (outcome === "ride") return 0;
  if (outcome === "fade") return 1;
  return 0;
}

function settlementWindowStillOpen(error: unknown) {
  return /window open/i.test(errorMessage(error));
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function refreshProofFlowReceiptHash(input: {
  marketId: string;
  resolutionId: string;
  txHash: string;
  status: string;
}) {
  const db = requireDatabase();
  const receipt = await db.proofFlowSettlementReceipt.findFirst({
    where: { marketId: input.marketId, resolutionId: input.resolutionId },
    orderBy: { createdAt: "desc" }
  });
  if (!receipt) return;
  const note = {
    ...jsonRecord(receipt.note),
    onchainReceiptHash: input.txHash,
    onchainSettlementStatus: input.status,
    onchainFinalizedAt: new Date().toISOString()
  };
  await db.proofFlowSettlementReceipt.update({
    where: { id: receipt.id },
    data: {
      note: note as never,
      receiptHash: null,
      hashStatus: "PENDING_HASH"
    }
  });
  await db.proofFlowReceiptHashJob.upsert({
    where: { receiptId: receipt.id },
    create: {
      marketId: input.marketId,
      receiptId: receipt.id,
      status: "PENDING_HASH"
    },
    update: {
      status: "PENDING_HASH",
      receiptHash: null,
      failureReason: null
    }
  });
}

async function recordProofFlowOnchainSettlement(input: {
  marketId: string;
  resolutionId: string;
  txHash: string;
  outcome: "ride" | "fade" | "invalid";
  status: string;
  manager: Address;
}) {
  const db = requireDatabase();
  const marketStatus = input.outcome === "invalid" ? "invalid_refund" : "settled";
  const proofFlowStatus = input.outcome === "invalid" ? "finalized_invalid" : `finalized_${input.outcome}`;
  await db.marketResolution.update({
    where: { id: input.resolutionId },
    data: {
      settlementTxHash: input.txHash,
      txHash: input.txHash,
      lastError: null
    }
  });
  await db.market.update({
    where: { id: input.marketId },
    data: {
      status: marketStatus,
      resolutionState: proofFlowStatus,
      settlementStatus: proofFlowStatus
    }
  });
  await refreshProofFlowReceiptHash({
    marketId: input.marketId,
    resolutionId: input.resolutionId,
    txHash: input.txHash,
    status: input.status
  });
  await db.adminAuditLog.create({
    data: {
      action: "proof_flow_onchain_settlement",
      target: input.marketId,
      metadata: { txHash: input.txHash, outcome: input.outcome, manager: input.manager, status: input.status } as never
    }
  });
}

async function settleProofFlowMarketsOnchain(input: {
  chainId: number;
  limit: number;
  fallbackManager: Address;
  accountAddress: Address;
  publicClient: Awaited<ReturnType<typeof clients>>["publicClient"];
  walletClient: Awaited<ReturnType<typeof clients>>["walletClient"];
}) {
  const db = requireDatabase();
  const resolutions = await db.marketResolution.findMany({
    where: {
      resolutionMode: "proofflow",
      OR: [
        {
          finalOutcome: { not: null },
          settlementTxHash: null,
          status: { in: ["finalized_yes", "finalized_no", "finalized_invalid", "refunded"] }
        },
        {
          proposedOutcome: { not: null },
          status: { in: ["challenge_open", "evidence_review", "additional_review"] }
        }
      ]
    },
    orderBy: [{ finalizedAt: "asc" }, { updatedAt: "asc" }],
    take: input.limit
  });
  const results: BotResult[] = [];

  for (const resolution of resolutions) {
    let manager = input.fallbackManager;
    try {
      const market = await db.market.findUnique({ where: { id: resolution.marketId } });
      if (!market || market.origin !== "native" || market.chainId !== input.chainId) continue;
      const marketAddress = configuredAddress(market.contractAddress);
      if (!marketAddress) throw new Error("Market contract address is invalid.");
      manager = marketResolutionManager(market, input.fallbackManager);
      const challengeCount = await db.proofFlowEvidenceSubmission.count({
        where: { marketId: market.id, kind: "challenge_evidence" }
      });
      const finalOutcome = resolution.finalOutcome as "ride" | "fade" | "invalid" | null;
      const proposedOutcome = resolution.proposedOutcome as "ride" | "fade" | "invalid" | null;
      const needsDisputer = challengeCount > 0 && !finalOutcome;
      const preflight = await checkResolutionWriteAccess({
        action: "proof_flow_onchain_settlement",
        marketId: market.id,
        marketAddress,
        manager,
        accountAddress: input.accountAddress,
        needsResolver: true,
        needsDisputer,
        publicClient: input.publicClient
      });
      if (preflight) {
        await recordResolutionPreflightFailure(preflight).catch(() => undefined);
        results.push(preflight);
        continue;
      }

      const onchainStatus = Number(await input.publicClient.readContract({
        address: marketAddress,
        abi: nativeBinaryMarketAbi,
        functionName: "status"
      }));

      if (onchainStatus === NATIVE_STATUS.Settled || onchainStatus === NATIVE_STATUS.InvalidRefund || onchainStatus === NATIVE_STATUS.CancelledBeforeTrading) {
        if (finalOutcome) {
          const marker = resolution.settlementTxHash ?? resolution.txHash ?? `already_onchain_${onchainStatus}`;
          await recordProofFlowOnchainSettlement({
            marketId: market.id,
            resolutionId: resolution.id,
            txHash: marker,
            outcome: finalOutcome,
            status: onchainStatus === NATIVE_STATUS.InvalidRefund || onchainStatus === NATIVE_STATUS.CancelledBeforeTrading ? "already_refundable" : "already_settled",
            manager
          });
          results.push({ action: "proof_flow_onchain_settlement", marketId: market.id, manager, ok: true, txHash: marker, outcome: finalOutcome, status: "already_terminal" });
        }
        continue;
      }

      if (onchainStatus === NATIVE_STATUS.LivePendingOpen || onchainStatus === NATIVE_STATUS.TradingLive) {
        const hash = await input.walletClient.writeContract({
          address: manager,
          abi: resolutionManagerAbi,
          functionName: "closeMarket",
          args: [marketAddress]
        });
        const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Close transaction failed.");
        await db.market.update({ where: { id: market.id }, data: { status: "closed", settlementStatus: market.settlementStatus === "trading_live" ? "closed" : market.settlementStatus, resolutionState: "closed" } });
        results.push({ action: "proof_flow_onchain_settlement", marketId: market.id, manager, ok: true, txHash: hash, status: "closed_onchain" });
        continue;
      }

      if (finalOutcome === "invalid") {
        const hash = await input.walletClient.writeContract({
          address: manager,
          abi: resolutionManagerAbi,
          functionName: "markInvalid",
          args: [marketAddress]
        });
        const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Invalid settlement transaction failed.");
        await recordProofFlowOnchainSettlement({
          marketId: market.id,
          resolutionId: resolution.id,
          txHash: hash,
          outcome: "invalid",
          status: "invalid_refund",
          manager
        });
        results.push({ action: "proof_flow_onchain_settlement", marketId: market.id, manager, ok: true, txHash: hash, outcome: "invalid", status: "invalid_refund" });
        continue;
      }

      const outcomeForProposal = proposedOutcome === "invalid" ? finalOutcome : proposedOutcome ?? finalOutcome;
      if (onchainStatus === NATIVE_STATUS.Closed && outcomeForProposal) {
        const hash = await input.walletClient.writeContract({
          address: manager,
          abi: resolutionManagerAbi,
          functionName: "proposeResult",
          args: [marketAddress, proofFlowSide(outcomeForProposal)]
        });
        const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Proposal transaction failed.");
        await db.marketResolution.update({ where: { id: resolution.id }, data: { assertionTxHash: hash, lastError: null } });
        await db.adminAuditLog.create({
          data: { action: "proof_flow_onchain_proposal", target: market.id, metadata: { txHash: hash, outcome: outcomeForProposal, manager } as never }
        });
        results.push({ action: "proof_flow_onchain_settlement", marketId: market.id, manager, ok: true, txHash: hash, outcome: outcomeForProposal, status: "proposed_onchain" });
        continue;
      }

      if (onchainStatus === NATIVE_STATUS.ResultProposed && challengeCount > 0) {
        const disputerPreflight = await checkResolutionWriteAccess({
          action: "proof_flow_onchain_settlement",
          marketId: market.id,
          marketAddress,
          manager,
          accountAddress: input.accountAddress,
          needsDisputer: true,
          publicClient: input.publicClient
        });
        if (disputerPreflight) {
          await recordResolutionPreflightFailure(disputerPreflight).catch(() => undefined);
          results.push(disputerPreflight);
          continue;
        }
        const hash = await input.walletClient.writeContract({
          address: manager,
          abi: resolutionManagerAbi,
          functionName: "disputeResult",
          args: [marketAddress]
        });
        const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Dispute transaction failed.");
        await db.marketResolution.update({ where: { id: resolution.id }, data: { txHash: hash, lastError: null } });
        await db.adminAuditLog.create({
          data: { action: "proof_flow_onchain_dispute", target: market.id, metadata: { txHash: hash, manager } as never }
        });
        results.push({ action: "proof_flow_onchain_settlement", marketId: market.id, manager, ok: true, txHash: hash, status: "disputed_onchain" });
        continue;
      }

      if (!finalOutcome) {
        results.push({ action: "proof_flow_onchain_settlement", marketId: market.id, manager, ok: true, status: "awaiting_final_outcome" });
        continue;
      }

      if (onchainStatus === NATIVE_STATUS.ResultProposed) {
        const hash = await input.walletClient.writeContract({
          address: manager,
          abi: resolutionManagerAbi,
          functionName: "finalizeUndisputed",
          args: [marketAddress]
        });
        const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Undisputed finalization transaction failed.");
        await recordProofFlowOnchainSettlement({
          marketId: market.id,
          resolutionId: resolution.id,
          txHash: hash,
          outcome: finalOutcome,
          status: "settled",
          manager
        });
        results.push({ action: "proof_flow_onchain_settlement", marketId: market.id, manager, ok: true, txHash: hash, outcome: finalOutcome, status: "settled" });
        continue;
      }

      if (onchainStatus === NATIVE_STATUS.Disputed) {
        const hash = await input.walletClient.writeContract({
          address: manager,
          abi: resolutionManagerAbi,
          functionName: "finalizeDisputed",
          args: [marketAddress, proofFlowSide(finalOutcome), false]
        });
        const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Disputed finalization transaction failed.");
        await recordProofFlowOnchainSettlement({
          marketId: market.id,
          resolutionId: resolution.id,
          txHash: hash,
          outcome: finalOutcome,
          status: "settled",
          manager
        });
        results.push({ action: "proof_flow_onchain_settlement", marketId: market.id, manager, ok: true, txHash: hash, outcome: finalOutcome, status: "settled" });
        continue;
      }

      results.push({ action: "proof_flow_onchain_settlement", marketId: market.id, manager, ok: true, status: `waiting_onchain_status_${onchainStatus}` });
    } catch (error) {
      const detail = errorMessage(error);
      if (isRateLimitError(error)) {
        results.push(rateLimitedResult({ action: "proof_flow_onchain_settlement", marketId: resolution.marketId, manager, detail }));
      } else if (settlementWindowStillOpen(error)) {
        results.push({ action: "proof_flow_onchain_settlement", marketId: resolution.marketId, manager, ok: true, status: "manager_window_not_ready", detail });
      } else {
        await recordResolutionError(resolution.marketId, detail).catch(() => undefined);
        results.push({ action: "proof_flow_onchain_settlement", marketId: resolution.marketId, manager, ok: false, detail });
      }
    }
  }

  return results;
}

export function nativeResolutionBotReadiness() {
  const enabled = process.env.NATIVE_RESOLUTION_BOT_ENABLED === "true";
  const chainId = defaultChainId();
  const config = chainConfig(chainId);
  const manager = configuredAddress(process.env.NATIVE_RESOLUTION_MANAGER_ADDRESS);
  const hasKey = Boolean(process.env.NATIVE_RESOLUTION_BOT_PRIVATE_KEY);
  return {
    enabled,
    configured: Boolean(manager && config.rpcUrl && hasKey),
    chainId,
    manager,
    rpcConfigured: Boolean(config.rpcUrl),
    signerConfigured: hasKey
  };
}

export async function queueNativeMarketProofFlowProvisional(input: {
  marketId: string;
  outcome: "ride" | "fade" | "invalid";
  claim: string;
  proposerWallet?: string;
}) {
  const proofFlow = await submitProofFlowProvisional({
    marketId: input.marketId,
    outcome: input.outcome,
    evidenceText: input.claim,
    walletAddress: input.proposerWallet,
    force: true
  });
  const db = requireDatabase();
  const resolution = await db.marketResolution.findFirst({
    where: { marketId: input.marketId },
    orderBy: { updatedAt: "desc" }
  });
  await db.adminAuditLog.create({
    data: { action: "queue_proofflow_provisional", target: input.marketId, metadata: { outcome: input.outcome, proofFlow } as never }
  });
  if (!resolution) throw new Error("ProofFlow provisional settlement did not create a resolution.");
  return resolution;
}

export async function runNativeResolutionBot(input: BotRunInput = {}) {
  const readiness = nativeResolutionBotReadiness();
  if (!input.force && !readiness.enabled) {
    return { ok: true, skipped: true, reason: "NATIVE_RESOLUTION_BOT_ENABLED is not true", readiness, results: [] as BotResult[] };
  }

  const chainId = input.chainId ?? readiness.chainId;
  const limit = input.limit ?? Number(process.env.NATIVE_RESOLUTION_BOT_MAX_MARKETS || 10);
  const shouldSyncEvents = input.sync ?? process.env.NATIVE_RESOLUTION_BOT_SYNC_EVENTS === "true";
  const results: BotResult[] = [];

  if (!readiness.configured) {
    results.push(...((await closeExpiredProofFlowMarkets({ limit })) as BotResult[]));
    results.push(...((await verifyClosedNativeMarketResults({ limit, force: input.force })) as BotResult[]));
    results.push(...((await finalizeExpiredProofFlowMarkets({ limit })) as BotResult[]));
    results.push(...((await processOpenProofFlowReviews({ limit })) as BotResult[]));
    results.push(...((await processProofFlowReceiptHashJobs({ limit })) as BotResult[]));
    results.push(...((await executeProofFlowRefundQueue({ limit })) as BotResult[]));
    results.push({
      action: "proof_flow_onchain_settlement",
      ok: true,
      status: "skipped",
      detail: "On-chain ProofFlow settlement skipped because the resolution bot wallet, manager, or RPC is not fully configured."
    });
    results.push({
      action: "sync_events",
      ok: true,
      status: "skipped",
      detail: "On-chain close/event sync skipped because the resolution bot wallet, manager, or RPC is not fully configured. ProofFlow DB settlement checks still ran."
    });
    return {
      ok: results.every((result) => result.ok),
      skipped: false,
      chainId,
      manager: readiness.manager ?? null,
      signer: null,
      readiness,
      results
    };
  }

  const defaultManager = resolutionManagerAddress();
  const { account, publicClient, walletClient } = await clients(chainId);

  try {
    const gasCheck = await checkBotGas({ publicClient, accountAddress: account.address, chainId });
    results.push(gasCheck);
    if (!gasCheck.ok) {
      results.push(...((await closeExpiredProofFlowMarkets({ limit })) as BotResult[]));
      results.push(...((await verifyClosedNativeMarketResults({ limit, force: input.force })) as BotResult[]));
      results.push(...((await finalizeExpiredProofFlowMarkets({ limit })) as BotResult[]));
      results.push(...((await processOpenProofFlowReviews({ limit })) as BotResult[]));
      results.push(...((await processProofFlowReceiptHashJobs({ limit })) as BotResult[]));
      results.push(...((await executeProofFlowRefundQueue({ limit })) as BotResult[]));
      results.push({ action: "proof_flow_onchain_settlement", ok: true, status: "skipped", detail: "On-chain ProofFlow settlement skipped because the bot wallet cannot pay gas." });
      results.push({ action: "sync_events", ok: true, status: "skipped", detail: "Event sync skipped because the bot wallet cannot pay gas for on-chain close writes. ProofFlow DB settlement checks still ran." });
      return {
        ok: results.every((result) => result.ok),
        skipped: false,
        chainId,
        manager: defaultManager,
        signer: account.address,
        results
      };
    }
    const roleCheck = await checkBotRoles({ publicClient, manager: defaultManager, accountAddress: account.address });
    results.push(roleCheck);
    if (!roleCheck.ok) {
      results.push(...((await closeExpiredProofFlowMarkets({ limit })) as BotResult[]));
      results.push(...((await verifyClosedNativeMarketResults({ limit, force: input.force })) as BotResult[]));
      results.push(...((await finalizeExpiredProofFlowMarkets({ limit })) as BotResult[]));
      results.push(...((await processOpenProofFlowReviews({ limit })) as BotResult[]));
      results.push(...((await processProofFlowReceiptHashJobs({ limit })) as BotResult[]));
      results.push(...((await executeProofFlowRefundQueue({ limit })) as BotResult[]));
      results.push({ action: "proof_flow_onchain_settlement", ok: true, status: "skipped", detail: "On-chain ProofFlow settlement skipped because the bot wallet cannot write through the default resolution manager." });
      results.push({ action: "sync_events", ok: true, status: "skipped", detail: "Event sync skipped because the bot wallet cannot close markets on the default manager. ProofFlow DB settlement checks still ran." });
      return {
        ok: results.every((result) => result.ok),
        skipped: false,
        chainId,
        manager: defaultManager,
        signer: account.address,
        results
      };
    }
  } catch (error) {
    const detail = errorMessage(error);
    results.push(isRateLimitError(error) ? rateLimitedResult({ action: "wallet_gas_check", detail }) : { action: "wallet_gas_check", ok: false, status: "failed", detail });
    if (!isRateLimitError(error)) {
      return {
        ok: results.every((result) => result.ok),
        skipped: false,
        chainId,
        manager: defaultManager,
        signer: account.address,
        results
      };
    }
  }

  results.push(...await closeExpiredMarkets({ chainId, limit, fallbackManager: defaultManager, accountAddress: account.address, publicClient, walletClient }));
  results.push(...((await closeExpiredProofFlowMarkets({ limit })) as BotResult[]));
  results.push(...((await verifyClosedNativeMarketResults({ limit, force: input.force })) as BotResult[]));
  results.push(...await settleProofFlowMarketsOnchain({ chainId, limit, fallbackManager: defaultManager, accountAddress: account.address, publicClient, walletClient }));
  results.push(...((await finalizeExpiredProofFlowMarkets({ limit })) as BotResult[]));
  results.push(...((await processOpenProofFlowReviews({ limit })) as BotResult[]));
  results.push(...await settleProofFlowMarketsOnchain({ chainId, limit, fallbackManager: defaultManager, accountAddress: account.address, publicClient, walletClient }));
  results.push(...((await processProofFlowReceiptHashJobs({ limit })) as BotResult[]));
  results.push(...((await executeProofFlowRefundQueue({ limit })) as BotResult[]));

  if (shouldSyncEvents) {
    try {
      const sync = await syncNativeMarketFactoryEvents({ chainId });
      results.push({ action: "sync_events", ok: true, detail: JSON.stringify(sync) });
    } catch (error) {
      const detail = errorMessage(error);
      results.push(isRateLimitError(error) ? rateLimitedResult({ action: "sync_events", detail }) : { action: "sync_events", ok: false, detail });
    }
  } else {
    results.push({ action: "sync_events", ok: true, status: "skipped", detail: "Event sync skipped for this run. Pass sync=true or set NATIVE_RESOLUTION_BOT_SYNC_EVENTS=true to enable it." });
  }

  return {
    ok: results.every((result) => result.ok),
    skipped: false,
    chainId,
    manager: defaultManager,
    signer: account.address,
    results
  };
}
