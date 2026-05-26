import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ClobClient, Chain } from "@polymarket/clob-client-v2";
import { createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const DEFAULT_CLOB_URL = "https://clob.polymarket.com";
const DEFAULT_POLYGON_RPC_URL = "https://polygon-rpc.com";

function loadEnvFile(file = ".env") {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

function normalizePrivateKey(value) {
  const privateKey = value?.trim();
  if (!privateKey) throw new Error("POLYMARKET_PRIVATE_KEY is missing.");
  const withPrefix = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(withPrefix)) {
    throw new Error("POLYMARKET_PRIVATE_KEY must be a 32-byte hex private key.");
  }
  return withPrefix;
}

function parseNonce() {
  const index = process.argv.findIndex((arg) => arg === "--nonce");
  if (index === -1) return undefined;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("--nonce must be a non-negative integer.");
  }
  return value;
}

function printHelp() {
  console.log(`
Derive Polymarket CLOB API credentials from POLYMARKET_PRIVATE_KEY.

Usage:
  npm run polymarket:derive-creds
  npm run polymarket:derive-creds -- --nonce 1

Reads:
  .env
  POLYMARKET_PRIVATE_KEY
  POLYMARKET_CLOB_URL optional, defaults to ${DEFAULT_CLOB_URL}
  POLYGON_RPC_URL optional, defaults to ${DEFAULT_POLYGON_RPC_URL}
  POLYMARKET_SIGNATURE_TYPE optional, defaults to 3
  POLYMARKET_FUNDER_ADDRESS optional, printed back when present
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  loadEnvFile();

  const host = process.env.POLYMARKET_CLOB_URL?.trim() || DEFAULT_CLOB_URL;
  const rpcUrl = process.env.POLYGON_RPC_URL?.trim() || DEFAULT_POLYGON_RPC_URL;
  const signatureType = Number(process.env.POLYMARKET_SIGNATURE_TYPE || 3);
  const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS?.trim();
  const privateKey = normalizePrivateKey(process.env.POLYMARKET_PRIVATE_KEY);
  const nonce = parseNonce();

  if (funderAddress && !isAddress(funderAddress)) {
    throw new Error("POLYMARKET_FUNDER_ADDRESS is present but is not a valid address.");
  }

  const account = privateKeyToAccount(privateKey);
  const signer = createWalletClient({ account, transport: http(rpcUrl) });
  const client = new ClobClient({
    host,
    chain: Chain.POLYGON,
    signer,
    useServerTime: true,
    throwOnError: true
  });

  console.error(`Deriving Polymarket CLOB credentials for ${account.address} via ${host}`);
  const creds = await client.createOrDeriveApiKey(nonce);

  console.log("");
  console.log("Add these to .env:");
  console.log(`POLYMARKET_API_KEY="${creds.key}"`);
  console.log(`POLYMARKET_API_SECRET="${creds.secret}"`);
  console.log(`POLYMARKET_API_PASSPHRASE="${creds.passphrase}"`);
  console.log(`POLYMARKET_SIGNATURE_TYPE=${signatureType}`);
  console.log(`POLYMARKET_FUNDER_ADDRESS="${funderAddress || ""}"`);
  console.log("");

  if (!funderAddress && signatureType === 3) {
    console.error("POLYMARKET_FUNDER_ADDRESS is still needed for real execution. Use your Polymarket deposit wallet address.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
