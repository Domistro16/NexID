import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local" });
dotenv.config({ override: false });

const contractAddress = process.argv[2]?.trim().toLowerCase();
const chainArg = process.argv.find((arg) => arg.startsWith("--chainId="));
const chainId = Number(chainArg?.split("=")[1] ?? process.env.NEXT_PUBLIC_NATIVE_MARKETS_CHAIN_ID ?? 8453);

if (!contractAddress || !/^0x[a-f0-9]{40}$/.test(contractAddress)) {
  console.error("Usage: node scripts/repair-native-market-record.mjs <contractAddress> [--chainId=8453]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX || 1)
  })
});

try {
  const alreadyMapped = await db.market.findFirst({
    where: {
      origin: "native",
      contractAddress
    },
    select: {
      id: true,
      status: true,
      title: true,
      contractAddress: true
    }
  });

  if (alreadyMapped) {
    console.log(JSON.stringify({ ok: true, alreadyMapped }, null, 2));
    process.exit(0);
  }

  const market = await db.market.findFirst({
    where: {
      origin: "native",
      chainId,
      contractAddress: null,
      status: { in: ["draft", "route_check", "ready_to_launch"] }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!market) {
    throw new Error(`No unlaunched native market was found on chain ${chainId}.`);
  }

  const routeDecision = {
    ...(market.routeDecision && typeof market.routeDecision === "object" && !Array.isArray(market.routeDecision)
      ? market.routeDecision
      : {}),
    source: "manual_native_market_repair",
    repairedAt: new Date().toISOString(),
    contractAddress,
    chainId,
    previousStatus: market.status
  };

  const updated = await db.market.update({
    where: { id: market.id },
    data: {
      status: "trading_live",
      contractAddress,
      chainId,
      launchStakeStatus: market.launchStakeStatus ?? "not_required",
      settlementStatus: "live",
      resolutionState: "live",
      routeDecision
    },
    select: {
      id: true,
      status: true,
      title: true,
      question: true,
      creatorWallet: true,
      chainId: true,
      contractAddress: true,
      launchStakeStatus: true,
      settlementStatus: true,
      resolutionState: true,
      createdAt: true,
      updatedAt: true
    }
  });

  await db.nativeMarketRules.updateMany({
    where: { marketId: market.id },
    data: {
      openTime: new Date()
    }
  });

  await db.proofFlowAuditEvent.create({
    data: {
      marketId: market.id,
      action: "manual_native_market_contract_mapping",
      fromStatus: market.status,
      toStatus: "trading_live",
      actorWallet: market.creatorWallet,
      metadata: {
        contractAddress,
        chainId,
        reason: "Onchain launch confirmed but factory event was not reflected in the local market record."
      }
    }
  });

  console.log(JSON.stringify({ ok: true, updated }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
