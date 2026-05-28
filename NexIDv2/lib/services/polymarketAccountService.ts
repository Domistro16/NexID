import { getAddress, isAddress } from "viem";
import { requireDatabase } from "@/lib/server/db";
import type { AuthUser, PolymarketTradingAccount } from "@/lib/types/nexid";

type PublicProfile = {
  proxyWallet?: string | null;
  wallet?: string | null;
  name?: string | null;
  pseudonym?: string | null;
  xUsername?: string | null;
  [key: string]: unknown;
};

export type PolymarketAccountResolution = {
  account: PolymarketTradingAccount | null;
  status: "ready" | "unlinked";
  message: string;
};

function gammaBaseUrl() {
  return process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com";
}

function normalizeAddress(value: string | null | undefined) {
  if (!value || !isAddress(value)) return null;
  return getAddress(value);
}

function userSignatureType() {
  const value = Number(process.env.POLYMARKET_DEFAULT_USER_SIGNATURE_TYPE ?? process.env.NEXT_PUBLIC_POLYMARKET_DEFAULT_USER_SIGNATURE_TYPE ?? 3);
  return [0, 1, 2, 3].includes(value) ? value : 3;
}

function serializeAccount(row: {
  ownerWalletAddress: string;
  funderAddress: string;
  signatureType: number;
  walletType: string;
  source: string;
  status: string;
  profileName: string | null;
  updatedAt: Date;
}): PolymarketTradingAccount {
  return {
    ownerWalletAddress: row.ownerWalletAddress,
    funderAddress: row.funderAddress,
    signatureType: row.signatureType,
    walletType: row.walletType,
    source: row.source,
    status: row.status,
    profileName: row.profileName,
    updatedAt: row.updatedAt.toISOString()
  };
}

function profileName(profile: PublicProfile) {
  return profile.name ?? profile.xUsername ?? profile.pseudonym ?? null;
}

function profileFunder(profile: PublicProfile | null) {
  if (!profile) return null;
  return normalizeAddress(profile.proxyWallet ?? profile.wallet);
}

async function fetchPublicProfile(ownerWalletAddress: string) {
  const url = new URL("/public-profile", gammaBaseUrl());
  url.searchParams.set("address", ownerWalletAddress);
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Polymarket profile lookup failed with HTTP ${response.status}.`);
  return response.json() as Promise<PublicProfile>;
}

export async function resolvePolymarketTradingAccount(user: AuthUser, refresh = false): Promise<PolymarketAccountResolution> {
  const db = requireDatabase();
  const ownerWalletAddress = getAddress(user.walletAddress);

  if (!refresh) {
    const existing = await db.polymarketAccount.findUnique({ where: { userId: user.id } });
    if (existing?.status === "ready") {
      return {
        account: serializeAccount(existing),
        status: "ready",
        message: "Polymarket trading wallet is linked."
      };
    }
  }

  const profile = await fetchPublicProfile(ownerWalletAddress);
  const funderAddress = profileFunder(profile);
  if (!funderAddress || funderAddress.toLowerCase() === ownerWalletAddress.toLowerCase()) {
    return {
      account: null,
      status: "unlinked",
      message: "No Polymarket deposit wallet was found for this connected wallet. Create or fund the Polymarket account for this wallet, then refresh NexMarkets."
    };
  }
  const profileData = profile as PublicProfile;

  const account = await db.polymarketAccount.upsert({
    where: { userId: user.id },
    update: {
      ownerWalletAddress,
      funderAddress,
      signatureType: userSignatureType(),
      walletType: "deposit_wallet",
      source: "polymarket_public_profile",
      status: "ready",
      profileName: profileName(profileData),
      rawProfile: profileData as never
    },
    create: {
      userId: user.id,
      ownerWalletAddress,
      funderAddress,
      signatureType: userSignatureType(),
      walletType: "deposit_wallet",
      source: "polymarket_public_profile",
      status: "ready",
      profileName: profileName(profileData),
      rawProfile: profileData as never
    }
  });

  return {
    account: serializeAccount(account),
    status: "ready",
    message: "Polymarket deposit wallet linked for routed trading."
  };
}
