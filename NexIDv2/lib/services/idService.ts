import { withDatabase } from "@/lib/server/db";
import { cleanIdName } from "@/lib/server/validation";
import { buildNexDomainsRegistration, confirmNexDomainsTransaction, getNexDomainsPrice } from "@/lib/services/nexdomainsClient";
import { recordIdMintFeeLedger } from "@/lib/services/rewardService";

const reservedNames = new Set(["admin", "nexid", "support", "root", "bankr", "polymarket", "wallet", "edgeboard"]);

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

export async function prepareIdMint(nameInput: string, owner: string, userId?: string, referralCode?: string | null) {
  const name = cleanIdName(nameInput);
  if (!name || reservedNames.has(name)) throw new Error("Name is unavailable");
  const rarity = rarityForName(name);
  const registration = await buildNexDomainsRegistration({ name, owner, referralCode });
  if (!registration) {
    throw new Error("NEXDOMAINS_API_BASE_URL is not configured");
  }
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
    payMethod: "Wallet",
    transaction: registration.transaction,
    price: registration.price,
    referral: registration.referral,
    message: registration.instructions
  };
}

export async function mintIdName(nameInput: string, payMethod = "USDC", userId?: string, txHash?: string) {
  const name = cleanIdName(nameInput);
  if (!name || reservedNames.has(name)) throw new Error("Name is unavailable");
  if (!txHash) throw new Error("Transaction hash is required to activate .id");
  await confirmNexDomainsTransaction(txHash);
  const rarity = rarityForName(name);
  return withDatabase(
    async (db) => {
      const existing = await db.idName.findUnique({ where: { name } });
      if (existing && existing.userId && userId && existing.userId !== userId) {
        throw new Error("Name is reserved by another user");
      }
      if (existing?.expiresAt && existing.expiresAt < new Date() && existing.status !== "active") {
        await db.idName.delete({ where: { name } });
      }
      const price = existing?.price ?? (await checkAvailability(name)).price;
      if (price == null) throw new Error("NexDomains did not return a price for this name");
      const row = await db.idName.upsert({
        where: { name },
        update: { userId, status: "active", mintedAt: new Date(), price, rarity, paymentStatus: "confirmed", paymentRef: txHash },
        create: { name, userId, status: "active", mintedAt: new Date(), price, rarity, paymentStatus: "confirmed", paymentRef: txHash }
      });
      if (userId) {
        await db.idName.updateMany({ where: { userId, name: { not: name } }, data: { isPrimary: false } });
        await db.idName.update({ where: { name }, data: { isPrimary: true } });
        await db.user.update({ where: { id: userId }, data: { primaryIdName: name } });
      }
      if (userId) {
        await recordIdMintFeeLedger({ userId, idName: name, priceUsd: price, txHash });
      }
      return { name: row.name, label: `${row.name}.id`, status: row.status, payMethod, price };
    },
    async () => {
      throw new Error("Database is required to activate .id names");
    }
  );
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
