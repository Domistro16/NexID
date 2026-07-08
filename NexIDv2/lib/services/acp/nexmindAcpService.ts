import { randomBytes } from "crypto";
import { getAddress, isAddress } from "viem";
import { requireDatabase, withDatabase } from "@/lib/server/db";
import { cleanIdName } from "@/lib/server/validation";
import { upsertWalletUser } from "@/lib/services/authService";
import {
  AGENT_LAUNCH_SCOPES,
  hashAgentApiKey,
  normalizeAgentScopes,
  recordAgentAudit,
  type AuthenticatedAgent
} from "@/lib/services/bankr/agentAuthService";
import {
  AGENT_LAUNCH_BOND_USDC,
  AgentLaunchError,
  agentIdLabel,
  launchMarketForAgent,
  normalizeAgentPublicId
} from "@/lib/services/agentLaunchService";
import { prepareIdMint } from "@/lib/services/idService";
import { composeNexMindMarketDraft } from "@/lib/services/nexmind/nexmindDraftService";
import { resolutionCardForDraft } from "@/lib/services/proofFlowService";
import type { MarketArena, ShapedMarketDraft } from "@/lib/types/nexmarkets";

export const ACP_NEXMIND_PROVIDER_ID = "nexmind";
export const ACP_MARKET_LAUNCH_SERVICE_CODE = "structure_launch_prediction_market";
export const ACP_MARKET_LAUNCH_TITLE = "Structure and launch a prediction market from a thesis";
export const ACP_MARKET_LAUNCH_FEE_USDC = 2;

export type AcpMarketLaunchJobInput = {
  rawThesis: string;
  walletAddress?: string | null;
  requesterWallet?: string | null;
  virtualsIdentity?: string | null;
  requesterVirtualsIdentity?: string | null;
  preferredDomain?: string | null;
  arenaHint?: MarketArena;
  confirmationMode?: "manual" | "auto";
  autoApprove?: boolean;
  chainId?: number;
  forceCreate?: boolean;
  externalJobId?: string | null;
  idempotencyKey?: string | null;
};

export type AcpMarketLaunchConfirmInput = {
  confirmed?: boolean;
  chainId?: number;
  forceCreate?: boolean;
  idempotencyKey?: string | null;
};

export type AcpJobSettlementInput = {
  settlementRef: string;
  status?: "settled" | "failed" | "refunded";
  amountUsdc?: number;
  providerWallet?: string | null;
  payload?: unknown;
};

type AgentLaunchResponse = Extract<Awaited<ReturnType<typeof launchMarketForAgent>>, { market: unknown; transaction: unknown }>;

export class AcpLaunchError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "acp_launch_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function normalizeWalletAddress(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || !isAddress(trimmed)) {
    throw new AcpLaunchError("ACP market launch requires a valid requester wallet.", 400, "invalid_requester_wallet");
  }
  return getAddress(trimmed);
}

function sameWallet(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function providerWallet() {
  return process.env.NEXMIND_ACP_PROVIDER_WALLET?.trim()
    || process.env.NEXMIND_WALLET_ADDRESS?.trim()
    || process.env.PROTOCOL_TREASURY_ADDRESS?.trim()
    || null;
}

function providerMetadata() {
  return {
    protocol: "ACP",
    providerId: ACP_NEXMIND_PROVIDER_ID,
    serviceCode: ACP_MARKET_LAUNCH_SERVICE_CODE,
    service: ACP_MARKET_LAUNCH_TITLE,
    confirmation: {
      requesterControlled: true,
      modes: ["manual", "auto"]
    },
    creatorOfRecord: "requester_wallet",
    serviceFee: {
      amountUsdc: ACP_MARKET_LAUNCH_FEE_USDC,
      settlementRail: "ACP escrow",
      recipient: providerWallet()
    },
    marketBond: {
      amountUsdc: AGENT_LAUNCH_BOND_USDC,
      paidBy: "requester_wallet",
      routing: "standard NexMarkets launch stake rules"
    }
  };
}

function serializeOffering(row: {
  id: string;
  providerId: string;
  providerName: string;
  serviceCode: string;
  title: string;
  description: string;
  feeUsdc: number;
  settlementRail: string;
  providerWallet: string | null;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    providerId: row.providerId,
    providerName: row.providerName,
    serviceCode: row.serviceCode,
    title: row.title,
    description: row.description,
    feeUsdc: row.feeUsdc,
    settlementRail: row.settlementRail,
    providerWallet: row.providerWallet,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function serializeJob(row: {
  id: string;
  externalJobId: string | null;
  requesterWallet: string;
  requesterVirtualsIdentity: string | null;
  requesterAgentId: string | null;
  requesterAgentProfileId: string | null;
  preferredDomain: string | null;
  resolvedPublicId: string | null;
  rawThesis: string;
  arenaHint: string | null;
  confirmationMode: string;
  autoApproved: boolean;
  status: string;
  draftId: string | null;
  marketId: string | null;
  structuredCard: unknown;
  draft: unknown;
  launchResponse: unknown;
  idAction: unknown;
  acpFeeUsdc: number;
  acpFeeStatus: string;
  acpSettlementRef: string | null;
  acpSettlementPayload: unknown;
  error: string | null;
  confirmedAt: Date | null;
  launchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    externalJobId: row.externalJobId,
    status: row.status,
    requester: {
      walletAddress: row.requesterWallet,
      virtualsIdentity: row.requesterVirtualsIdentity,
      agentId: row.requesterAgentId,
      agentProfileId: row.requesterAgentProfileId,
      publicId: row.resolvedPublicId,
      idLabel: agentIdLabel(row.resolvedPublicId)
    },
    thesis: row.rawThesis,
    arenaHint: row.arenaHint,
    confirmation: {
      mode: row.confirmationMode,
      autoApproved: row.autoApproved,
      confirmedAt: row.confirmedAt?.toISOString() ?? null
    },
    resolutionCard: row.structuredCard,
    draft: row.draft,
    idAction: row.idAction,
    launch: row.launchResponse,
    marketId: row.marketId,
    fees: {
      acpJobFeeUsdc: row.acpFeeUsdc,
      acpJobFeeStatus: row.acpFeeStatus,
      acpSettlementRef: row.acpSettlementRef,
      acpSettlementPayload: row.acpSettlementPayload,
      creatorBondUsdc: AGENT_LAUNCH_BOND_USDC,
      creatorBondPaidBy: "requester_wallet"
    },
    error: row.error,
    launchedAt: row.launchedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function resolutionCardFromDraft(draft: ShapedMarketDraft) {
  const card = resolutionCardForDraft({ draft });
  return {
    title: draft.title,
    settlementSource: draft.settlementSource ?? draft.resolution.sourceName,
    rideConditions: draft.sides.ride,
    fadeConditions: draft.sides.fade,
    invalidConditions: card.invalidRule,
    closeTime: card.closeTime,
    proofFlow: card
  };
}

function fallbackProviderOffering() {
  const now = new Date();
  return serializeOffering({
    id: "acp_nexmind_market_launch",
    providerId: ACP_NEXMIND_PROVIDER_ID,
    providerName: "NexMind",
    serviceCode: ACP_MARKET_LAUNCH_SERVICE_CODE,
    title: ACP_MARKET_LAUNCH_TITLE,
    description: "NexMind structures a raw thesis into a locked Resolution Card, then prepares the standard NexMarkets launch authorization for the requesting wallet.",
    feeUsdc: ACP_MARKET_LAUNCH_FEE_USDC,
    settlementRail: "ACP_ESCROW",
    providerWallet: providerWallet(),
    status: "active",
    metadata: providerMetadata(),
    createdAt: now,
    updatedAt: now
  });
}

export async function getAcpProviderOffering() {
  return withDatabase(
    async (db) => {
      const row = await db.acpProviderOffering.upsert({
        where: {
          providerId_serviceCode: {
            providerId: ACP_NEXMIND_PROVIDER_ID,
            serviceCode: ACP_MARKET_LAUNCH_SERVICE_CODE
          }
        },
        update: {
          providerName: "NexMind",
          title: ACP_MARKET_LAUNCH_TITLE,
          description: "NexMind structures a raw thesis into a locked Resolution Card, then prepares the standard NexMarkets launch authorization for the requesting wallet.",
          feeUsdc: ACP_MARKET_LAUNCH_FEE_USDC,
          settlementRail: "ACP_ESCROW",
          providerWallet: providerWallet() ?? undefined,
          status: "active",
          metadata: jsonInput(providerMetadata())
        },
        create: {
          providerId: ACP_NEXMIND_PROVIDER_ID,
          providerName: "NexMind",
          serviceCode: ACP_MARKET_LAUNCH_SERVICE_CODE,
          title: ACP_MARKET_LAUNCH_TITLE,
          description: "NexMind structures a raw thesis into a locked Resolution Card, then prepares the standard NexMarkets launch authorization for the requesting wallet.",
          feeUsdc: ACP_MARKET_LAUNCH_FEE_USDC,
          settlementRail: "ACP_ESCROW",
          providerWallet: providerWallet() ?? undefined,
          status: "active",
          metadata: jsonInput(providerMetadata())
        }
      });
      return serializeOffering(row);
    },
    async () => fallbackProviderOffering()
  );
}

async function profileForWallet(walletAddress: string) {
  const db = requireDatabase();
  return db.agentProfile.findFirst({
    where: { ownerWallet: walletAddress },
    orderBy: { createdAt: "asc" }
  });
}

async function activeLocalIdForWallet(walletAddress: string) {
  const db = requireDatabase();
  return db.idName.findFirst({
    where: {
      status: "active",
      user: { walletAddress }
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
  });
}

async function publicIdAvailableForWallet(publicId: string, walletAddress: string) {
  const db = requireDatabase();
  const [profile, idName] = await Promise.all([
    db.agentProfile.findUnique({ where: { publicId } }),
    db.idName.findUnique({ where: { name: publicId }, include: { user: true } })
  ]);
  if (profile && !sameWallet(profile.ownerWallet, walletAddress)) return false;
  if (idName?.status === "active" && !sameWallet(idName.user?.walletAddress, walletAddress)) return false;
  return true;
}

function derivePublicId(input: { walletAddress: string; virtualsIdentity?: string | null }) {
  const suffix = input.walletAddress.slice(2, 8).toLowerCase();
  const base = normalizeAgentPublicId(input.virtualsIdentity)
    || cleanIdName(input.virtualsIdentity ?? "")
    || "virtuals-agent";
  const head = base.slice(0, Math.max(1, 23 - suffix.length)).replace(/-+$/g, "") || "agent";
  return `${head}-${suffix}`.slice(0, 24).replace(/-+$/g, "");
}

async function firstAvailableDerivedPublicId(input: { walletAddress: string; virtualsIdentity?: string | null }) {
  const base = derivePublicId(input);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = attempt ? `-${attempt}` : "";
    const candidate = `${base.slice(0, 24 - suffix.length)}${suffix}`.replace(/-+$/g, "");
    if (await publicIdAvailableForWallet(candidate, input.walletAddress)) return candidate;
  }
  return `${input.walletAddress.slice(2, 10).toLowerCase()}-agent`.slice(0, 24);
}

async function prepareIdAction(input: { publicId: string; walletAddress: string; userId: string; alreadyActive: boolean }) {
  const label = agentIdLabel(input.publicId);
  if (input.alreadyActive) {
    return {
      required: false,
      status: "active",
      publicId: input.publicId,
      label,
      ownerWallet: input.walletAddress
    };
  }
  try {
    const prepared = await prepareIdMint(input.publicId, input.walletAddress, input.userId);
    return {
      required: true,
      status: "prepared",
      publicId: input.publicId,
      label,
      ownerWallet: input.walletAddress,
      transaction: prepared.transaction,
      payment: prepared.payment,
      price: prepared.price,
      message: prepared.message
    };
  } catch (error) {
    return {
      required: true,
      status: "prepare_failed",
      publicId: input.publicId,
      label,
      ownerWallet: input.walletAddress,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function resolveAcpIdentity(input: {
  walletAddress: string;
  preferredDomain?: string | null;
  virtualsIdentity?: string | null;
}) {
  const existingProfile = await profileForWallet(input.walletAddress);
  const profilePublicId = normalizeAgentPublicId(existingProfile?.publicId);
  const owner = await upsertWalletUser({
    walletAddress: input.walletAddress,
    displayName: input.virtualsIdentity ?? existingProfile?.displayName ?? null,
    primaryDomainName: agentIdLabel(profilePublicId) ?? undefined
  });
  const activeId = profilePublicId ? null : await activeLocalIdForWallet(input.walletAddress);
  const activePublicId = normalizeAgentPublicId(activeId?.name);
  const preferredPublicId = normalizeAgentPublicId(input.preferredDomain);
  let publicId = profilePublicId || activePublicId;
  let alreadyActive = Boolean(publicId && (profilePublicId || activePublicId));
  let preferredUnavailable = false;

  if (!publicId && preferredPublicId) {
    if (await publicIdAvailableForWallet(preferredPublicId, input.walletAddress)) {
      publicId = preferredPublicId;
    } else {
      preferredUnavailable = true;
    }
  }
  if (!publicId) {
    publicId = await firstAvailableDerivedPublicId({
      walletAddress: input.walletAddress,
      virtualsIdentity: input.virtualsIdentity
    });
  }

  const idAction = await prepareIdAction({
    publicId,
    walletAddress: input.walletAddress,
    userId: owner.id,
    alreadyActive
  });
  return {
    owner,
    publicId,
    idAction: {
      ...idAction,
      preferredDomain: preferredPublicId || null,
      preferredUnavailable,
      derivedFromVirtualsIdentity: !profilePublicId && !activePublicId && (!preferredPublicId || preferredUnavailable)
    }
  };
}

async function ensureAcpRequesterAgent(input: {
  walletAddress: string;
  publicId: string;
  virtualsIdentity?: string | null;
}): Promise<AuthenticatedAgent> {
  const db = requireDatabase();
  const displayName = agentIdLabel(input.publicId) ?? input.virtualsIdentity ?? "ACP requester";
  const user = await upsertWalletUser({
    walletAddress: input.walletAddress,
    displayName,
    primaryDomainName: agentIdLabel(input.publicId) ?? undefined
  });
  const scopes = [...AGENT_LAUNCH_SCOPES];
  let profile = await profileForWallet(input.walletAddress);
  if (!profile) {
    // ACP shares the direct agent-launch identity silo: AgentProfile.publicId is
    // the .id anchor for reputation, launch history, and disclosure.
    profile = await db.agentProfile.create({
      data: {
        publicId: input.publicId,
        displayName,
        ownerUserId: user.id,
        ownerWallet: input.walletAddress
      }
    });
  } else if (!profile.publicId || !sameWallet(profile.ownerWallet, input.walletAddress)) {
    profile = await db.agentProfile.update({
      where: { id: profile.id },
      data: {
        publicId: profile.publicId ?? input.publicId,
        displayName: profile.publicId ? profile.displayName : displayName,
        ownerUserId: profile.ownerUserId ?? user.id,
        ownerWallet: profile.ownerWallet ?? input.walletAddress
      }
    });
  }

  let key = await db.agentApiKey.findFirst({
    where: {
      agentProfileId: profile.id,
      status: "active"
    },
    orderBy: { createdAt: "asc" }
  });
  if (!key) {
    key = await db.agentApiKey.create({
      data: {
        agentProfileId: profile.id,
        name: "ACP market launch requester",
        keyHash: hashAgentApiKey(`acp_${randomBytes(32).toString("hex")}`),
        walletAddress: input.walletAddress,
        identity: displayName,
        userId: user.id,
        scopes: jsonInput(scopes)
      }
    });
  }

  return {
    id: key.id,
    agentProfileId: profile.id,
    name: profile.displayName,
    walletAddress: profile.ownerWallet ?? key.walletAddress,
    identity: agentIdLabel(profile.publicId) ?? profile.displayName,
    publicId: normalizeAgentPublicId(profile.publicId),
    userId: profile.ownerUserId ?? key.userId,
    scopes: normalizeAgentScopes(key.scopes),
    source: "database",
    dailyLaunchLimit: profile.dailyLaunchLimit,
    maxBondSpendUsdc: profile.maxBondSpendUsdc,
    launchesToday: profile.launchesToday,
    bondSpentTodayUsdc: profile.bondSpentTodayUsdc,
    limitsResetAt: profile.limitsResetAt,
    launchingDisabled: profile.launchingDisabled
  };
}

export async function createAcpMarketLaunchJob(input: AcpMarketLaunchJobInput) {
  const requesterWallet = normalizeWalletAddress(input.requesterWallet ?? input.walletAddress);
  const virtualsIdentity = input.requesterVirtualsIdentity ?? input.virtualsIdentity ?? null;
  const externalJobId = input.externalJobId?.trim() || null;
  const db = requireDatabase();

  if (externalJobId) {
    const existing = await db.acpMarketLaunchJob.findUnique({ where: { externalJobId } });
    if (existing) return serializeJob(existing);
  }

  const [offering, draft, identity] = await Promise.all([
    getAcpProviderOffering(),
    composeNexMindMarketDraft({ rawThesis: input.rawThesis, arenaHint: input.arenaHint }),
    resolveAcpIdentity({
      walletAddress: requesterWallet,
      preferredDomain: input.preferredDomain,
      virtualsIdentity
    })
  ]);
  const agent = await ensureAcpRequesterAgent({
    walletAddress: requesterWallet,
    publicId: identity.publicId,
    virtualsIdentity
  });
  const structuredCard = resolutionCardFromDraft(draft);
  const confirmationMode = input.autoApprove ? "auto" : input.confirmationMode ?? "manual";
  const job = await db.acpMarketLaunchJob.create({
    data: {
      externalJobId: externalJobId ?? undefined,
      providerOfferingId: offering.id.startsWith("acp_") ? undefined : offering.id,
      requesterWallet,
      requesterVirtualsIdentity: virtualsIdentity ?? undefined,
      requesterAgentId: agent.id,
      requesterAgentProfileId: agent.agentProfileId ?? undefined,
      preferredDomain: input.preferredDomain ? normalizeAgentPublicId(input.preferredDomain) : undefined,
      resolvedPublicId: identity.publicId,
      rawThesis: input.rawThesis,
      arenaHint: input.arenaHint,
      confirmationMode,
      autoApproved: confirmationMode === "auto",
      status: "structured_pending_confirmation",
      structuredCard: jsonInput(structuredCard),
      draft: jsonInput(draft),
      idAction: jsonInput(identity.idAction),
      acpFeeUsdc: ACP_MARKET_LAUNCH_FEE_USDC
    }
  });
  await recordAgentAudit({
    agentId: agent.id,
    agentProfileId: agent.agentProfileId,
    action: "acp_structure_market",
    status: "structured",
    metadata: {
      acpJobId: job.id,
      externalJobId,
      confirmationMode,
      preferredDomain: input.preferredDomain ?? null,
      resolvedPublicId: identity.publicId
    }
  });

  if (confirmationMode === "auto") {
    return confirmAcpMarketLaunchJob(job.id, {
      confirmed: true,
      chainId: input.chainId,
      forceCreate: input.forceCreate,
      idempotencyKey: input.idempotencyKey
    });
  }
  return serializeJob(job);
}

async function loadAcpJob(id: string) {
  const db = requireDatabase();
  const row = await db.acpMarketLaunchJob.findUnique({ where: { id } });
  if (!row) throw new AcpLaunchError("ACP job was not found.", 404, "acp_job_not_found");
  return row;
}

async function agentForAcpJob(row: Awaited<ReturnType<typeof loadAcpJob>>) {
  if (!row.requesterAgentId) {
    return ensureAcpRequesterAgent({
      walletAddress: row.requesterWallet,
      publicId: row.resolvedPublicId ?? derivePublicId({ walletAddress: row.requesterWallet, virtualsIdentity: row.requesterVirtualsIdentity }),
      virtualsIdentity: row.requesterVirtualsIdentity
    });
  }
  const db = requireDatabase();
  const key = await db.agentApiKey.findUnique({
    where: { id: row.requesterAgentId },
    include: { agentProfile: true }
  });
  if (!key || key.status !== "active" || !key.agentProfile) {
    return ensureAcpRequesterAgent({
      walletAddress: row.requesterWallet,
      publicId: row.resolvedPublicId ?? derivePublicId({ walletAddress: row.requesterWallet, virtualsIdentity: row.requesterVirtualsIdentity }),
      virtualsIdentity: row.requesterVirtualsIdentity
    });
  }
  return {
    id: key.id,
    agentProfileId: key.agentProfile.id,
    name: key.agentProfile.displayName,
    walletAddress: key.agentProfile.ownerWallet ?? key.walletAddress,
    identity: agentIdLabel(key.agentProfile.publicId) ?? key.agentProfile.displayName,
    publicId: normalizeAgentPublicId(key.agentProfile.publicId),
    userId: key.agentProfile.ownerUserId ?? key.userId,
    scopes: normalizeAgentScopes(key.scopes),
    source: "database" as const,
    dailyLaunchLimit: key.agentProfile.dailyLaunchLimit,
    maxBondSpendUsdc: key.agentProfile.maxBondSpendUsdc,
    launchesToday: key.agentProfile.launchesToday,
    bondSpentTodayUsdc: key.agentProfile.bondSpentTodayUsdc,
    limitsResetAt: key.agentProfile.limitsResetAt,
    launchingDisabled: key.agentProfile.launchingDisabled
  };
}

function draftFromJob(row: { draft: unknown }) {
  if (!row.draft || typeof row.draft !== "object") {
    throw new AcpLaunchError("ACP job does not contain a structured draft.", 409, "acp_job_missing_draft");
  }
  return row.draft as ShapedMarketDraft;
}

function isAgentLaunchResponse(value: Awaited<ReturnType<typeof launchMarketForAgent>>): value is AgentLaunchResponse {
  return Boolean(value && typeof value === "object" && "market" in value && "transaction" in value);
}

export async function getAcpMarketLaunchJob(id: string) {
  return serializeJob(await loadAcpJob(id));
}

export async function confirmAcpMarketLaunchJob(id: string, input: AcpMarketLaunchConfirmInput = {}) {
  if (input.confirmed === false) {
    throw new AcpLaunchError("ACP market launch confirmation was declined by the requester.", 409, "acp_confirmation_declined");
  }
  const row = await loadAcpJob(id);
  if (row.launchResponse) return serializeJob(row);
  if (!["structured_pending_confirmation", "failed"].includes(row.status)) {
    throw new AcpLaunchError(`ACP job cannot be confirmed from status ${row.status}.`, 409, "acp_job_not_confirmable");
  }
  const agent = await agentForAcpJob(row);
  try {
    const response = await launchMarketForAgent({
      agent,
      draft: draftFromJob(row),
      chainId: input.chainId,
      forceCreate: input.forceCreate,
      idempotencyKey: input.idempotencyKey ?? row.externalJobId ?? row.id,
      launchMethod: "acp_nexmind"
    });
    if (!isAgentLaunchResponse(response)) {
      throw new AcpLaunchError("ACP launch confirmation returned an incomplete launch authorization.", 409, "acp_launch_authorization_incomplete");
    }
    const updated = await requireDatabase().acpMarketLaunchJob.update({
      where: { id: row.id },
      data: {
        requesterAgentId: agent.id,
        requesterAgentProfileId: agent.agentProfileId ?? undefined,
        resolvedPublicId: normalizeAgentPublicId(agent.publicId) || row.resolvedPublicId,
        status: "launch_authorized_pending_onchain",
        marketId: response.market.id,
        launchResponse: jsonInput(response),
        confirmedAt: row.confirmedAt ?? new Date(),
        launchedAt: new Date(),
        error: null
      }
    });
    await recordAgentAudit({
      agentId: agent.id,
      agentProfileId: agent.agentProfileId,
      marketId: response.market.id,
      action: "acp_confirm_launch",
      status: "authorized",
      metadata: {
        acpJobId: row.id,
        externalJobId: row.externalJobId,
        marketId: response.market.id,
        ownerAccount: response.transaction.ownerAccount,
        nexMindCreatorOfRecord: false
      }
    });
    return serializeJob(updated);
  } catch (error) {
    const updated = await requireDatabase().acpMarketLaunchJob.update({
      where: { id: row.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      }
    });
    if (error instanceof AgentLaunchError) throw error;
    throw new AcpLaunchError(updated.error ?? "ACP launch confirmation failed.", 400, "acp_launch_confirmation_failed");
  }
}

export async function recordAcpJobFeeSettlement(id: string, input: AcpJobSettlementInput) {
  const row = await loadAcpJob(id);
  const amountUsdc = input.amountUsdc ?? row.acpFeeUsdc;
  const provider = input.providerWallet?.trim() || providerWallet();
  const updated = await requireDatabase().acpMarketLaunchJob.update({
    where: { id },
    data: {
      acpFeeUsdc: amountUsdc,
      acpFeeStatus: input.status ?? "settled",
      acpSettlementRef: input.settlementRef,
      acpSettlementPayload: jsonInput({
        providerWallet: provider,
        amountUsdc,
        payload: input.payload ?? null,
        recordedAt: new Date().toISOString()
      })
    }
  });
  if (row.requesterAgentId || row.requesterAgentProfileId) {
    await recordAgentAudit({
      agentId: row.requesterAgentId,
      agentProfileId: row.requesterAgentProfileId,
      marketId: row.marketId,
      action: "acp_fee_settlement",
      status: input.status ?? "settled",
      metadata: {
        acpJobId: row.id,
        settlementRef: input.settlementRef,
        providerWallet: provider,
        amountUsdc
      }
    });
  }
  return serializeJob(updated);
}

export function acpApiError(error: unknown) {
  if (error instanceof AcpLaunchError || error instanceof AgentLaunchError) {
    return {
      body: {
        error: error.message,
        code: "code" in error ? error.code : "acp_error"
      },
      status: "status" in error ? error.status : 400
    };
  }
  return {
    body: {
      error: error instanceof Error ? error.message : "Unexpected ACP error"
    },
    status: 400
  };
}
