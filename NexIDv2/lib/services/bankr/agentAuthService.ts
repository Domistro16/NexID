import { createHash, randomBytes } from "crypto";
import { requireDatabase, withDatabase } from "@/lib/server/db";

export type AuthenticatedAgent = {
  id: string;
  agentProfileId: string | null;
  name: string;
  walletAddress: string | null;
  identity: string | null;
  publicId: string | null;
  userId: string | null;
  scopes: string[];
  source: "database" | "env";
  dailyLaunchLimit?: number;
  maxBondSpendUsdc?: number;
  launchesToday?: number;
  bondSpentTodayUsdc?: number;
  limitsResetAt?: Date | null;
  launchingDisabled?: boolean;
};

export const AGENT_LAUNCH_SCOPES = [
  "markets:read",
  "markets:search",
  "markets:draft",
  "markets:validate",
  "markets:preview",
  "markets:launch",
  "agents:read",
  "agents:write"
] as const;

export const DEFAULT_AGENT_LAUNCH_SCOPES = [
  "markets:read",
  "markets:search",
  "markets:draft",
  "markets:validate",
  "markets:preview",
  "agents:read"
];

const legacyScopeMap: Record<string, string[]> = {
  draft: ["markets:read", "markets:search", "markets:draft"],
  route: ["markets:read", "markets:validate", "markets:preview"],
  launch: ["markets:read", "markets:search", "markets:draft", "markets:validate", "markets:preview", "markets:launch"],
  source: ["markets:read", "markets:validate"],
  trending: ["markets:read", "markets:search"]
};

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function normalizePublicId(value?: string | null) {
  return String(value ?? "").trim().replace(/\.id$/i, "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || null;
}

function agentIdLabel(value?: string | null) {
  const publicId = normalizePublicId(value);
  return publicId ? `${publicId}.id` : null;
}

export function hashAgentApiKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeAgentScopes(value: unknown) {
  if (!Array.isArray(value)) return [];
  const scopes = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    scopes.add(item);
    for (const mapped of legacyScopeMap[item] ?? []) scopes.add(mapped);
  }
  return [...scopes];
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function requestKey(request: Request) {
  return request.headers.get("x-nexmarkets-agent-key")?.trim() || bearerToken(request);
}

function envAgentFor(key: string | null): AuthenticatedAgent | null {
  const secret = process.env.NEXMARKETS_AGENT_SHARED_SECRET?.trim();
  if (!secret || !key || key !== secret) return null;
  return {
    id: "env-agent",
    agentProfileId: null,
    name: "Env agent",
    walletAddress: process.env.NEXMARKETS_AGENT_WALLET_ADDRESS?.trim() || null,
    identity: process.env.NEXMARKETS_AGENT_IDENTITY?.trim() || null,
    publicId: process.env.NEXMARKETS_AGENT_PUBLIC_ID?.trim() || null,
    userId: null,
    scopes: [...AGENT_LAUNCH_SCOPES],
    source: "env"
  };
}

function hasScope(agent: AuthenticatedAgent, scope?: string) {
  if (!scope) return true;
  return agent.scopes.includes("*") || agent.scopes.includes(scope);
}

export async function createAgentApiKey(input: {
  name: string;
  walletAddress?: string | null;
  identity?: string | null;
  publicId?: string | null;
  userId?: string | null;
  scopes?: string[];
  monthlyLimitUsd?: number | null;
  dailyLaunchLimit?: number | null;
  maxBondSpendUsdc?: number | null;
}) {
  const db = requireDatabase();
  const key = `nxag_${randomBytes(32).toString("hex")}`;
  const publicId = normalizePublicId(input.publicId);
  const row = await db.$transaction(async (tx) => {
    const profile = await tx.agentProfile.create({
      data: {
        publicId: publicId ?? undefined,
        displayName: input.identity ?? agentIdLabel(publicId) ?? input.name,
        ownerUserId: input.userId ?? undefined,
        ownerWallet: input.walletAddress ?? undefined,
        dailyLaunchLimit: input.dailyLaunchLimit ?? undefined,
        maxBondSpendUsdc: input.maxBondSpendUsdc ?? undefined
      }
    });
    return tx.agentApiKey.create({
      data: {
        agentProfileId: profile.id,
        name: input.name,
        keyHash: hashAgentApiKey(key),
        walletAddress: input.walletAddress ?? undefined,
        identity: input.identity ?? undefined,
        publicId: publicId ?? undefined,
        userId: input.userId ?? undefined,
        scopes: jsonInput(input.scopes?.length ? input.scopes : DEFAULT_AGENT_LAUNCH_SCOPES),
        monthlyLimitUsd: input.monthlyLimitUsd ?? undefined,
        dailyLaunchLimit: input.dailyLaunchLimit ?? undefined,
        maxBondSpendUsdc: input.maxBondSpendUsdc ?? undefined
      }
    });
  });
  return {
    id: row.id,
    agentProfileId: row.agentProfileId,
    key,
    name: row.name,
    scopes: normalizeAgentScopes(row.scopes)
  };
}

export async function authenticateAgentRequest(request: Request, requiredScope?: string): Promise<AuthenticatedAgent> {
  const key = requestKey(request);
  const envAgent = envAgentFor(key);
  if (envAgent) {
    if (!hasScope(envAgent, requiredScope)) throw new Error("Agent key is missing the required scope.");
    return envAgent;
  }
  if (!key) throw new Error("Agent API key required.");

  const db = requireDatabase();
  const row = await db.agentApiKey.findUnique({
    where: { keyHash: hashAgentApiKey(key) },
    include: { agentProfile: true }
  });
  if (!row || row.status !== "active") throw new Error("Invalid or disabled agent API key.");
  const profile = row.agentProfile;
  const publicId = normalizePublicId(profile?.publicId ?? row.publicId);
  const agent = {
    id: row.id,
    agentProfileId: profile?.id ?? row.agentProfileId,
    name: profile?.displayName ?? row.name,
    walletAddress: profile?.ownerWallet ?? row.walletAddress,
    identity: agentIdLabel(publicId) ?? profile?.displayName ?? row.identity,
    publicId,
    userId: profile?.ownerUserId ?? row.userId,
    scopes: normalizeAgentScopes(row.scopes),
    source: "database" as const,
    dailyLaunchLimit: profile?.dailyLaunchLimit ?? row.dailyLaunchLimit,
    maxBondSpendUsdc: profile?.maxBondSpendUsdc ?? row.maxBondSpendUsdc,
    launchesToday: profile?.launchesToday ?? row.launchesToday,
    bondSpentTodayUsdc: profile?.bondSpentTodayUsdc ?? row.bondSpentTodayUsdc,
    limitsResetAt: profile?.limitsResetAt ?? row.limitsResetAt,
    launchingDisabled: profile?.launchingDisabled ?? row.launchingDisabled
  };
  if (!hasScope(agent, requiredScope)) throw new Error("Agent key is missing the required scope.");
  await db.agentApiKey.update({
    where: { id: row.id },
    data: {
      lastUsedAt: new Date(),
      requestsToday: { increment: 1 }
    }
  });
  return agent;
}

export async function recordAgentAudit(input: {
  agentId?: string | null;
  agentProfileId?: string | null;
  marketId?: string | null;
  action: string;
  status: string;
  requestIp?: string | null;
  metadata?: unknown;
}) {
  return withDatabase(
    async (db) => {
      await db.agentMarketAuditLog.create({
        data: {
          agentId: input.agentId ?? undefined,
          agentProfileId: input.agentProfileId ?? undefined,
          marketId: input.marketId ?? undefined,
          action: input.action,
          status: input.status,
          requestIp: input.requestIp ?? undefined,
          metadata: input.metadata === undefined ? undefined : jsonInput(input.metadata)
        }
      });
      return true;
    },
    async () => false
  );
}
