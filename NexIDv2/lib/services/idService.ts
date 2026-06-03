import { withDatabase } from "@/lib/server/db";
import { cleanIdName } from "@/lib/server/validation";
import { buildNexDomainsRegistration, confirmNexDomainsTransaction, getNexDomainsPrice } from "@/lib/services/nexdomainsClient";
import { recordIdMintFeeLedger } from "@/lib/services/rewardService";
import {
  type ClaimablePaymentPlan,
  finalizeClaimableSpend,
  markClaimableReservationPaymentReceived,
  normalizePayMode,
  planClaimablePayment,
  releaseClaimableReservation,
  reserveClaimablePayment
} from "@/lib/services/claimableBalanceService";
import { edgeRewardDistributorConfigured, relayEdgeRewardSpendForIdMint } from "@/lib/services/edgeRewardDistributorService";
import type { JsonInput } from "@/lib/types/json";
import { createPublicClient, createWalletClient, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const reservedNames = new Set(["admin", "nexid", "support", "root", "bankr", "polymarket", "wallet", "edgeboard"]);
type NexDomainsRegistration = NonNullable<Awaited<ReturnType<typeof buildNexDomainsRegistration>>>;
type ClaimableIdMintMetadata = {
  kind: "id_mint";
  name: string;
  owner: string;
  payMethod: string;
  registration: NexDomainsRegistration;
  plan: ClaimablePaymentPlan;
  walletValueWei: string;
  relayerAddress: string;
};

function rarityForName(name: string) {
  const length = name.length;
  if (length === 1) return "Ultra";
  if (length === 2) return "Rare";
  if (length === 3) return "Premium";
  if (length === 4) return "Scarce";
  return "Standard";
}

function formattedUsdToNumber(value: string | undefined) {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function decimalUnitsToNumber(value: string | undefined, decimals = 18) {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const units = BigInt(10) ** BigInt(decimals);
  const amount = BigInt(raw);
  const whole = amount / units;
  const fraction = amount % units;
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 8);
  const numeric = Number(`${whole.toString()}${fractionText ? `.${fractionText}` : ""}`);
  return Number.isFinite(numeric) ? numeric : null;
}

function usdFromNexDomainsPrice(price: { priceUsd?: string; priceUsdFormatted?: string }) {
  return formattedUsdToNumber(price.priceUsdFormatted) ?? decimalUnitsToNumber(price.priceUsd);
}

function relayerPrivateKey() {
  const value = process.env.NEXDOMAINS_RELAYER_PRIVATE_KEY?.trim();
  if (!value) return null;
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function relayerAccount() {
  const privateKey = relayerPrivateKey();
  return privateKey ? privateKeyToAccount(privateKey) : null;
}

export function claimableMintRelayerConfigured() {
  return Boolean(relayerPrivateKey());
}

export function claimableMintRelayerAddress() {
  return relayerAccount()?.address ?? null;
}

async function relayNexDomainsRegistration(transaction: { to: string; data: `0x${string}`; value: string; chainId: number }) {
  const account = relayerAccount();
  if (!account) {
    throw new Error("Claimable balance .id checkout requires NEXDOMAINS_RELAYER_PRIVATE_KEY so the protocol can submit the NexDomains registration transaction.");
  }
  const client = createWalletClient({
    account,
    chain: base,
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org")
  });
  return client.sendTransaction({
    account,
    to: transaction.to as `0x${string}`,
    data: transaction.data,
    value: BigInt(transaction.value || "0")
  });
}

function cents(value: number) {
  return BigInt(Math.max(0, Math.round(value * 100)));
}

function walletRemainderWei(input: { totalValueWei: string; priceUsd: number; walletUsd: number }) {
  const totalValueWei = BigInt(input.totalValueWei || "0");
  const priceCents = cents(input.priceUsd);
  const walletCents = cents(input.walletUsd);
  if (totalValueWei <= BigInt(0) || walletCents <= BigInt(0) || priceCents <= BigInt(0)) return BigInt(0);
  if (walletCents >= priceCents) return totalValueWei;
  return (totalValueWei * walletCents + priceCents - BigInt(1)) / priceCents;
}

async function confirmRelayerRemainderPayment(input: {
  txHash: string;
  from: string;
  to: string;
  valueWei: bigint;
}) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(input.txHash)) throw new Error("Invalid transaction hash");
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org")
  });
  const hash = input.txHash as `0x${string}`;
  const receipt = await client.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 120_000
  });
  if (receipt.status !== "success") throw new Error("Wallet remainder payment failed");
  const transaction = await client.getTransaction({ hash });
  if (getAddress(transaction.from) !== getAddress(input.from)) throw new Error("Wallet remainder payment was not sent from the signed-in wallet.");
  if (!transaction.to || getAddress(transaction.to) !== getAddress(input.to)) throw new Error("Wallet remainder payment was not sent to the NexMarkets relayer.");
  if (transaction.value < input.valueWei) throw new Error("Wallet remainder payment is below the required amount.");
  return { txHash: input.txHash, valueWei: transaction.value.toString() };
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function claimableIdMintMetadata(value: unknown): ClaimableIdMintMetadata {
  const metadata = metadataRecord(value);
  const registration = metadata.registration as NexDomainsRegistration | undefined;
  const plan = metadata.plan as ClaimablePaymentPlan | undefined;
  if (metadata.kind !== "id_mint" || !registration?.transaction || !plan) {
    throw new Error("Claimable .id checkout reservation is missing registration data.");
  }
  return {
    kind: "id_mint",
    name: String(metadata.name || registration.name || ""),
    owner: String(metadata.owner || ""),
    payMethod: String(metadata.payMethod || "EdgeBoard rewards"),
    registration,
    plan,
    walletValueWei: String(metadata.walletValueWei || "0"),
    relayerAddress: String(metadata.relayerAddress || "")
  };
}

async function loadClaimableIdMintReservation(userId: string, referenceId: string) {
  return withDatabase(
    async (db) => {
      const row = await db.claimableBalanceLedger.findFirst({
        where: {
          userId,
          referenceId,
          sourceType: "edge_reward",
          entryType: "reserve",
          status: { in: ["reserved", "payment_received"] }
        },
        orderBy: { createdAt: "desc" }
      });
      if (!row) throw new Error("Claimable .id checkout reservation was not found. Start checkout again.");
      return claimableIdMintMetadata(row.metadata);
    },
    async () => {
      throw new Error("Database is required to complete claimable .id checkout.");
    }
  );
}

async function activateIdName(input: {
  name: string;
  userId?: string;
  price: number;
  rarity: string;
  txHash: string;
  payMethod: string;
  recordFeeLedger: boolean;
}) {
  return withDatabase(
    async (db) => {
      const existing = await db.idName.findUnique({ where: { name: input.name } });
      if (existing && existing.userId && input.userId && existing.userId !== input.userId) {
        throw new Error("Name is reserved by another user");
      }
      if (existing?.expiresAt && existing.expiresAt < new Date() && existing.status !== "active") {
        await db.idName.delete({ where: { name: input.name } });
      }
      const row = await db.idName.upsert({
        where: { name: input.name },
        update: {
          userId: input.userId,
          status: "active",
          mintedAt: new Date(),
          price: input.price,
          rarity: input.rarity,
          paymentStatus: "confirmed",
          paymentRef: input.txHash
        },
        create: {
          name: input.name,
          userId: input.userId,
          status: "active",
          mintedAt: new Date(),
          price: input.price,
          rarity: input.rarity,
          paymentStatus: "confirmed",
          paymentRef: input.txHash
        }
      });
      if (input.userId) {
        await db.idName.updateMany({ where: { userId: input.userId, name: { not: input.name } }, data: { isPrimary: false } });
        await db.idName.update({ where: { name: input.name }, data: { isPrimary: true } });
        await db.user.update({ where: { id: input.userId }, data: { primaryIdName: input.name } });
      }
      if (input.userId && input.recordFeeLedger) {
        await recordIdMintFeeLedger({ userId: input.userId, idName: input.name, priceUsd: input.price, txHash: input.txHash });
      }
      return { name: row.name, label: `${row.name}.id`, status: row.status, payMethod: input.payMethod, price: input.price };
    },
    async () => {
      throw new Error("Database is required to activate .id names");
    }
  );
}

async function preparedIdPrice(name: string) {
  return withDatabase(
    async (db) => {
      const existing = await db.idName.findUnique({
        where: { name },
        select: { price: true }
      });
      return existing?.price ?? null;
    },
    async () => null
  );
}

export async function checkAvailability(nameInput: string) {
  const name = cleanIdName(nameInput);
  if (!name || reservedNames.has(name)) {
    return { name, label: name ? `${name}.id` : "", available: false, price: null };
  }
  const external = await getNexDomainsPrice(name);
  if (!external) {
    throw new Error("NexDomains pricing API is unavailable. Configure NEXDOMAINS_API_BASE_URL before checking .id prices.");
  }
  const externalPrice = usdFromNexDomainsPrice(external);
  if (externalPrice == null) throw new Error("NexDomains pricing API did not return a usable USD price.");
  return withDatabase(
    async (db) => {
      const existing = await db.idName.findUnique({ where: { name: external.name } });
      if (existing?.expiresAt && existing.expiresAt < new Date() && existing.status !== "active") {
        await db.idName.delete({ where: { name: external.name } });
      }
      return {
        name: external.name,
        label: `${external.name}.id`,
        available: external.available && (!existing || existing.status !== "active"),
        price: externalPrice,
        priceWei: external.priceWei,
        priceUsdFormatted: external.priceUsdFormatted,
        priceEthFormatted: external.priceEthFormatted,
        isAgentName: external.isAgentName
      };
    },
    async () => ({
      name: external.name,
      label: `${external.name}.id`,
      available: external.available,
      price: externalPrice,
      priceWei: external.priceWei,
      priceUsdFormatted: external.priceUsdFormatted,
      priceEthFormatted: external.priceEthFormatted,
      isAgentName: external.isAgentName
    })
  );
}

export async function reserveIdName(nameInput: string, userId?: string) {
  const availability = await checkAvailability(nameInput);
  if (!availability.available) throw new Error("Name is unavailable");
  if (availability.price == null) throw new Error("NexDomains did not return a price for this name");
  const rarity = rarityForName(availability.name);
  return withDatabase(
    async (db) => {
      const row = await db.idName.create({
        data: {
          name: availability.name,
          userId,
          price: availability.price,
          rarity,
          status: "reserved",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });
      return { name: row.name, expiresInSeconds: 600, status: row.status };
    },
    async () => {
      throw new Error("Database is required to reserve .id names");
    }
  );
}

export async function prepareIdMint(nameInput: string, owner: string, userId?: string, referralCode?: string | null, payMethod = "Wallet") {
  const name = cleanIdName(nameInput);
  if (!name || reservedNames.has(name)) throw new Error("Name is unavailable");
  const rarity = rarityForName(name);
  const registration = await buildNexDomainsRegistration({ name, owner, referralCode });
  if (!registration) {
    throw new Error("NEXDOMAINS_API_BASE_URL is not configured");
  }
  const payment = userId
    ? await planClaimablePayment(userId, registration.price.usd, payMethod)
    : {
      mode: "wallet" as const,
      priceUsd: registration.price.usd,
      referralCreditUsd: 0,
      edgeRewardCreditUsd: 0,
      walletUsd: registration.price.usd,
      creditUsd: 0,
      requiresWalletTransaction: true
    };
  await withDatabase(
    async (db) => {
      await db.idName.upsert({
        where: { name },
        update: { userId, status: "payment_pending", price: registration.price.usd, rarity, paymentStatus: "pending" },
        create: { name, userId, status: "payment_pending", price: registration.price.usd, rarity, paymentStatus: "pending" }
      });
      return true;
    },
    async () => {
      throw new Error("Database is required to prepare .id minting");
    }
  );
  return {
    name: registration.name,
    label: registration.fullName,
    status: "payment_pending",
    payMethod,
    transaction: registration.transaction,
    payment,
    price: registration.price,
    referral: registration.referral,
    message: registration.instructions
  };
}

async function upsertPendingIdMint(input: { name: string; userId: string; price: number; rarity: string }) {
  return withDatabase(
    async (db) => {
      await db.idName.upsert({
        where: { name: input.name },
        update: { userId: input.userId, status: "payment_pending", price: input.price, rarity: input.rarity, paymentStatus: "pending" },
        create: { name: input.name, userId: input.userId, status: "payment_pending", price: input.price, rarity: input.rarity, paymentStatus: "pending" }
      });
      return true;
    },
    async () => {
      throw new Error("Database is required to prepare .id minting");
    }
  );
}

export async function prepareIdMintWithClaimableBalance(nameInput: string, payMethod: string, owner: string, userId: string, referralCode?: string | null) {
  const name = cleanIdName(nameInput);
  if (!name || reservedNames.has(name)) throw new Error("Name is unavailable");
  const mode = normalizePayMode(payMethod);
  if (mode === "wallet") throw new Error("Wallet payment should use the wallet transaction flow.");
  const rarity = rarityForName(name);
  const registration = await buildNexDomainsRegistration({ name, owner, referralCode });
  if (!registration) throw new Error("NEXDOMAINS_API_BASE_URL is not configured");

  const plan = await planClaimablePayment(userId, registration.price.usd, payMethod);
  if (plan.creditUsd <= 0) throw new Error("No EdgeBoard claimable balance is available for this checkout.");
  if (!claimableMintRelayerConfigured()) {
    throw new Error("Claimable balance checkout is configured in the app, but the NexDomains relayer key is missing. Set NEXDOMAINS_RELAYER_PRIVATE_KEY before enabling this payment route.");
  }
  if (!edgeRewardDistributorConfigured()) {
    throw new Error("EdgeBoard reward checkout requires EDGE_REWARD_DISTRIBUTOR_ADDRESS and EDGE_REWARD_AUTHORIZER_PRIVATE_KEY so locked rewards can move through the reward distributor contract.");
  }

  const referenceId = `id_mint:${userId}:${name}:${Date.now()}`;
  const relayerAddress = claimableMintRelayerAddress();
  if (!relayerAddress) throw new Error("Claimable balance checkout relayer is not configured.");
  const walletValueWei = walletRemainderWei({
    totalValueWei: registration.transaction.value,
    priceUsd: plan.priceUsd,
    walletUsd: plan.walletUsd
  });
  const metadata: ClaimableIdMintMetadata = {
    kind: "id_mint",
    name,
    owner,
    payMethod,
    registration,
    plan,
    walletValueWei: walletValueWei.toString(),
    relayerAddress
  };
  await reserveClaimablePayment({
    userId,
    priceUsd: registration.price.usd,
    payMethod,
    referenceId,
    metadata: metadata as unknown as JsonInput,
    plan
  });

  try {
    await upsertPendingIdMint({ name, userId, price: registration.price.usd, rarity });
    if (plan.requiresWalletTransaction && walletValueWei > BigInt(0)) {
      return {
        name: registration.name,
        label: registration.fullName,
        status: "payment_pending",
        payMethod,
        checkoutReferenceId: referenceId,
        transaction: {
          to: relayerAddress as `0x${string}`,
          data: "0x" as `0x${string}`,
          value: walletValueWei.toString(),
          chainId: registration.transaction.chainId
        },
        payment: plan,
        price: registration.price,
        referral: registration.referral,
        message: `EdgeBoard rewards cover $${plan.creditUsd.toFixed(2)}. Send the wallet remainder to complete the .id mint.`
      };
    }

    await relayEdgeRewardSpendForIdMint({
      account: owner,
      recipient: relayerAddress,
      amountUsd: plan.creditUsd,
      idName: name,
      referenceId
    });
    const txHash = await relayNexDomainsRegistration(registration.transaction);
    await confirmNexDomainsTransaction(txHash);
    const id = await activateIdName({
      name,
      userId,
      price: registration.price.usd,
      rarity,
      txHash,
      payMethod,
      recordFeeLedger: false
    });
    await finalizeClaimableSpend(userId, referenceId, txHash);
    return { ...id, payment: plan, txHash, checkoutReferenceId: referenceId, referral: registration.referral };
  } catch (error) {
    await releaseClaimableReservation(userId, referenceId);
    throw error;
  }
}

export async function completeIdMintWithClaimableBalance(input: {
  nameInput: string;
  payMethod: string;
  owner: string;
  userId: string;
  walletPaymentTxHash: string;
  checkoutReferenceId?: string | null;
}) {
  const name = cleanIdName(input.nameInput);
  if (!name || reservedNames.has(name)) throw new Error("Name is unavailable");
  if (!input.checkoutReferenceId) throw new Error("Claimable checkout reference is required.");
  const metadata = await loadClaimableIdMintReservation(input.userId, input.checkoutReferenceId);
  if (metadata.name !== name) throw new Error("Claimable checkout reference does not match this .id name.");
  if (getAddress(metadata.owner) !== getAddress(input.owner)) throw new Error("Claimable checkout owner does not match the signed-in wallet.");
  const walletValueWei = BigInt(metadata.walletValueWei || "0");
  let paymentReceived = false;

  try {
    if (walletValueWei > BigInt(0)) {
      await confirmRelayerRemainderPayment({
        txHash: input.walletPaymentTxHash,
        from: input.owner,
        to: metadata.relayerAddress,
        valueWei: walletValueWei
      });
      paymentReceived = true;
      await markClaimableReservationPaymentReceived(input.userId, input.checkoutReferenceId, input.walletPaymentTxHash);
    }

    await relayEdgeRewardSpendForIdMint({
      account: input.owner,
      recipient: metadata.relayerAddress,
      amountUsd: metadata.plan.creditUsd,
      idName: name,
      referenceId: input.checkoutReferenceId
    });
    const txHash = await relayNexDomainsRegistration(metadata.registration.transaction);
    await confirmNexDomainsTransaction(txHash);
    const id = await activateIdName({
      name,
      userId: input.userId,
      price: metadata.plan.priceUsd,
      rarity: rarityForName(name),
      txHash,
      payMethod: input.payMethod,
      recordFeeLedger: false
    });
    if (metadata.plan.walletUsd > 0) {
      await recordIdMintFeeLedger({ userId: input.userId, idName: name, priceUsd: metadata.plan.walletUsd, txHash: input.walletPaymentTxHash });
    }
    await finalizeClaimableSpend(input.userId, input.checkoutReferenceId, txHash);
    return {
      ...id,
      payment: metadata.plan,
      txHash,
      walletPaymentTxHash: input.walletPaymentTxHash,
      checkoutReferenceId: input.checkoutReferenceId,
      referral: metadata.registration.referral
    };
  } catch (error) {
    if (!paymentReceived) await releaseClaimableReservation(input.userId, input.checkoutReferenceId);
    throw error;
  }
}

export async function mintIdName(nameInput: string, payMethod = "USDC", userId?: string, txHash?: string) {
  const name = cleanIdName(nameInput);
  if (!name || reservedNames.has(name)) throw new Error("Name is unavailable");
  if (!txHash) throw new Error("Transaction hash is required to activate .id");
  const storedPrice = await preparedIdPrice(name);
  await confirmNexDomainsTransaction(txHash);
  const rarity = rarityForName(name);
  const price = storedPrice ?? (await checkAvailability(name)).price;
  if (price == null) throw new Error("NexDomains did not return a price for this name");
  return activateIdName({ name, userId, price, rarity, txHash, payMethod, recordFeeLedger: true });
}

export async function listUserIdNames(userId?: string) {
  return withDatabase(
    async (db) => {
      if (!userId) return [];
      const rows = await db.idName.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
      return rows.map((row) => ({ name: row.name, label: `${row.name}.id`, status: row.status, isPrimary: row.isPrimary }));
    },
    async () => []
  );
}
