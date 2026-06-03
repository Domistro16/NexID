import { createHash, randomBytes } from "crypto";
import { requireDatabase, withDatabase } from "@/lib/server/db";

export type AuthenticatedAgent = {
  id: string;
  name: string;
  walletAddress: string | null;
  identity: string | null;
  userId: string | null;
  scopes: string[];
  source: "database" | "env";
};

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

export function hashAgentApiKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeScopes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
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
    name: "Env agent",
    walletAddress: process.env.NEXMARKETS_AGENT_WALLET_ADDRESS?.trim() || null,
    identity: process.env.NEXMARKETS_AGENT_IDENTITY?.trim() || "bankr-agent",
    userId: null,
    scopes: ["draft", "route", "launch", "source", "trending"],
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
  userId?: string | null;
  scopes?: string[];
  monthlyLimitUsd?: number | null;
}) {
  const db = requireDatabase();
  const key = `nxag_${randomBytes(32).toString("hex")}`;
  const row = await db.agentApiKey.create({
    data: {
      name: input.name,
      keyHash: hashAgentApiKey(key),
      walletAddress: input.walletAddress ?? undefined,
      identity: input.identity ?? undefined,
      userId: input.userId ?? undefined,
      scopes: jsonInput(input.scopes?.length ? input.scopes : ["draft", "route"]),
      monthlyLimitUsd: input.monthlyLimitUsd ?? undefined
    }
  });
  return {
    id: row.id,
    key,
    name: row.name,
    scopes: normalizeScopes(row.scopes)
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
  const row = await db.agentApiKey.findUnique({ where: { keyHash: hashAgentApiKey(key) } });
  if (!row || row.status !== "active") throw new Error("Invalid or disabled agent API key.");
  const agent = {
    id: row.id,
    name: row.name,
    walletAddress: row.walletAddress,
    identity: row.identity,
    userId: row.userId,
    scopes: normalizeScopes(row.scopes),
    source: "database" as const
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
