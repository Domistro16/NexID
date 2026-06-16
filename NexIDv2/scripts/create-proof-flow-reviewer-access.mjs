import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getAddress, isAddress } from "viem";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function usage() {
  console.log([
    "Usage:",
    "  node scripts/create-proof-flow-reviewer-access.mjs --access-id atlas.review --wallet 0x... [--key secret] [--display-name Atlas]",
    "",
    "If --key is omitted, a new access key is generated and printed once."
  ].join("\n"));
}

function normalizeAccessId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function accessKeyHash(accessKey, salt = randomBytes(16).toString("hex")) {
  const key = String(accessKey ?? "").trim();
  if (key.length < 12) throw new Error("Access key must be at least 12 characters.");
  return {
    keySalt: salt,
    keyHash: scryptSync(key, salt, 32).toString("hex")
  };
}

const accessId = normalizeAccessId(arg("access-id"));
const walletInput = arg("wallet");
const displayName = arg("display-name");
const suppliedKey = arg("key");
const accessKey = suppliedKey || randomBytes(24).toString("base64url");

if (!accessId || !walletInput || !isAddress(walletInput)) {
  usage();
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const reviewerWallet = getAddress(walletInput);
const { keyHash, keySalt } = accessKeyHash(accessKey);
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX || 1)
});
const db = new PrismaClient({ adapter });

try {
  const user = await db.user.findFirst({
    where: { walletAddress: { equals: reviewerWallet, mode: "insensitive" } }
  });
  const row = await db.proofFlowReviewerAccess.upsert({
    where: { accessId },
    create: {
      accessId,
      reviewerWallet,
      reviewerUserId: user?.id,
      displayName: displayName ?? user?.displayName ?? accessId,
      keyHash,
      keySalt,
      status: "ACTIVE"
    },
    update: {
      reviewerWallet,
      reviewerUserId: user?.id ?? null,
      displayName: displayName ?? user?.displayName ?? accessId,
      keyHash,
      keySalt,
      status: "ACTIVE",
      revokedAt: null
    }
  });

  console.log(`Reviewer access ready: ${row.accessId}`);
  console.log(`Reviewer wallet: ${row.reviewerWallet}`);
  if (!suppliedKey) {
    console.log(`Access key: ${accessKey}`);
  } else {
    console.log("Access key: updated from supplied value");
  }
} finally {
  await db.$disconnect();
}
