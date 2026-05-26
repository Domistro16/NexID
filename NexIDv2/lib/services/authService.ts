import { randomBytes } from "crypto";
import { getAddress, isAddress, verifyMessage } from "viem";
import { normalizePrimaryDomainName, resolvePrimaryDomainName } from "@/lib/identity";
import { withDatabase } from "@/lib/server/db";
import { clearSessionCookie, createSessionToken, hashToken, readSessionToken, sessionExpiry, setSessionCookie } from "@/lib/server/session";
import { resolveNexDomainsPrimaryName } from "@/lib/services/nexdomainsPrimaryService";
import type { AuthUser } from "@/lib/types/nexid";

type MemoryNonce = {
  walletAddress: string;
  message: string;
  expiresAt: number;
  used: boolean;
};

type MemorySession = {
  user: AuthUser;
  expiresAt: number;
};

const memoryNonces = new Map<string, MemoryNonce>();
const memorySessions = new Map<string, MemorySession>();

function normalizeWallet(walletAddress: string) {
  if (!isAddress(walletAddress)) throw new Error("Invalid wallet address");
  return getAddress(walletAddress);
}

function nonceMessage(walletAddress: string, nonce: string) {
  return [
    "Sign in to NexID EdgeBoard.",
    "",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    "",
    "This signature proves wallet ownership. It does not authorize a trade."
  ].join("\n");
}

async function resolvedPrimaryDomainForWallet(input: { walletAddress: string; displayName?: string | null; primaryDomainName?: string | null }) {
  const onchainPrimaryName = await resolveNexDomainsPrimaryName(input.walletAddress);
  return onchainPrimaryName
    ?? normalizePrimaryDomainName(input.primaryDomainName, true)
    ?? normalizePrimaryDomainName(input.displayName);
}

function authUserFromRow(row: {
  id: string;
  walletAddress: string;
  displayName: string | null;
  primaryIdName: string | null;
  pointsTotal: number;
}, primaryDomainName?: string | null): AuthUser {
  return {
    id: row.id,
    walletAddress: row.walletAddress,
    displayName: row.displayName,
    primaryIdName: row.primaryIdName,
    primaryDomainName: resolvePrimaryDomainName({
      primaryIdName: row.primaryIdName,
      primaryDomainName,
      displayName: row.displayName
    }),
    pointsTotal: row.pointsTotal
  };
}

export async function upsertWalletUser(input: { walletAddress: string; displayName?: string | null; primaryDomainName?: string | null }): Promise<AuthUser> {
  const walletAddress = normalizeWallet(input.walletAddress);
  const primaryDomainName = await resolvedPrimaryDomainForWallet({ ...input, walletAddress });
  const displayName = primaryDomainName ?? input.displayName ?? undefined;
  const displayNameData = displayName ? { displayName } : {};

  return withDatabase(
    async (db) => {
      const user = await db.user.upsert({
        where: { walletAddress },
        update: displayNameData,
        create: { walletAddress, ...displayNameData }
      });
      return authUserFromRow(user, primaryDomainName);
    },
    async () => ({
      id: `wallet_${walletAddress.slice(2, 10).toLowerCase()}`,
      walletAddress,
      displayName: displayName ?? null,
      primaryIdName: null,
      primaryDomainName,
      pointsTotal: 0
    })
  );
}

export async function createWalletNonce(walletAddressInput: string) {
  const walletAddress = normalizeWallet(walletAddressInput);
  const nonce = randomBytes(16).toString("hex");
  const message = nonceMessage(walletAddress, nonce);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  return withDatabase(
    async (db) => {
      await db.walletNonce.create({
        data: { walletAddress, nonce, message, expiresAt }
      });
      return { walletAddress, nonce, message, expiresAt: expiresAt.toISOString() };
    },
    async () => {
      memoryNonces.set(nonce, { walletAddress, message, expiresAt: expiresAt.getTime(), used: false });
      return { walletAddress, nonce, message, expiresAt: expiresAt.toISOString() };
    }
  );
}

export async function verifyWalletAndCreateSession(input: {
  walletAddress: string;
  message: string;
  signature: string;
  displayName?: string;
  primaryDomainName?: string;
}) {
  const walletAddress = normalizeWallet(input.walletAddress);
  const nonce = input.message.match(/Nonce:\s*([a-f0-9]+)/i)?.[1];
  if (!nonce) throw new Error("Invalid sign-in message");

  const nonceRecord = await withDatabase(
    async (db) => {
      const row = await db.walletNonce.findUnique({ where: { nonce } });
      if (!row) return null;
      if (row.usedAt || row.expiresAt < new Date()) return null;
      if (row.walletAddress !== walletAddress || row.message !== input.message) return null;
      await db.walletNonce.update({ where: { nonce }, data: { usedAt: new Date() } });
      return { walletAddress: row.walletAddress, message: row.message };
    },
    async () => {
      const row = memoryNonces.get(nonce);
      if (!row || row.used || row.expiresAt < Date.now()) return null;
      if (row.walletAddress !== walletAddress || row.message !== input.message) return null;
      row.used = true;
      return { walletAddress: row.walletAddress, message: row.message };
    }
  );
  if (!nonceRecord) throw new Error("Nonce expired or already used");

  const verified = await verifyMessage({
    address: walletAddress,
    message: input.message,
    signature: input.signature as `0x${string}`
  });
  if (!verified) throw new Error("Wallet signature could not be verified");

  const user = await upsertWalletUser({ walletAddress, displayName: input.displayName, primaryDomainName: input.primaryDomainName });
  const token = createSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = sessionExpiry();

  await withDatabase(
    async (db) => {
      await db.authSession.create({
        data: { tokenHash, userId: user.id, walletAddress, expiresAt }
      });
      return true;
    },
    async () => {
      memorySessions.set(tokenHash, { user, expiresAt: expiresAt.getTime() });
      return true;
    }
  );

  await setSessionCookie(token, expiresAt);
  return user;
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const token = await readSessionToken();
  if (!token) return null;
  const tokenHash = hashToken(token);

  return withDatabase(
    async (db) => {
      const session = await db.authSession.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!session || session.expiresAt < new Date()) return null;
      const existingDomainName = resolvePrimaryDomainName(session.user);
      const primaryDomainName = existingDomainName ?? await resolveNexDomainsPrimaryName(session.user.walletAddress);
      if (primaryDomainName && primaryDomainName !== session.user.displayName && !session.user.primaryIdName) {
        await db.user.update({ where: { id: session.user.id }, data: { displayName: primaryDomainName } });
      }
      return authUserFromRow(session.user, primaryDomainName);
    },
    async () => {
      const session = memorySessions.get(tokenHash);
      if (!session || session.expiresAt < Date.now()) return null;
      return session.user;
    }
  );
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

export async function logoutSession() {
  const token = await readSessionToken();
  if (token) {
    const tokenHash = hashToken(token);
    await withDatabase(
      async (db) => {
        await db.authSession.deleteMany({ where: { tokenHash } });
        return true;
      },
      async () => {
        memorySessions.delete(tokenHash);
        return true;
      }
    );
  }
  await clearSessionCookie();
  return { ok: true };
}
