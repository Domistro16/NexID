import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1
});
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

try {
  // Find all Base Sepolia native markets
  const sepoliaMarkets = await db.market.findMany({
    where: {
      chainId: 84532,
      origin: "native"
    }
  });

  console.log(`Found ${sepoliaMarkets.length} Base Sepolia native markets.`);

  if (sepoliaMarkets.length === 0) {
    console.log("No markets to delete.");
    process.exit(0);
  }

  const marketIds = sepoliaMarkets.map(m => m.id);

  console.log("\nMarkets to be deleted:");
  for (const market of sepoliaMarkets) {
    console.log(`- [ID: ${market.id}] Title: "${market.title}" | Question: "${market.question}"`);
  }
  console.log("");

  const deleteParams = { where: { marketId: { in: marketIds } } };

  // List of tables to clear
  const tables = [
    "marketComment",
    "marketOrderbookOrder",
    "nativeTargetOrder",
    "marketResolution",
    "marketDispute",
    "proofFlowEvidenceSubmission",
    "proofFlowReviewPanel",
    "proofFlowReviewerAssignment",
    "proofFlowReviewerReward",
    "proofFlowRefundQueue",
    "proofFlowAuditEvent",
    "proofFlowReceiptHashJob",
    "proofFlowSettlementReceipt",
    "launchStake",
    "nativePosition",
    "trade"
  ];

  for (const table of tables) {
    if (db[table]) {
      const count = await db[table].deleteMany(deleteParams);
      console.log(`Deleted ${count.count} records from ${table}`);
    } else {
      console.log(`Skipped ${table} (does not exist on client)`);
    }
  }

  // Delete the markets themselves
  const marketDelete = await db.market.deleteMany({
    where: { id: { in: marketIds } }
  });
  console.log(`Successfully deleted ${marketDelete.count} market records from Market table.`);

} catch (error) {
  console.error("Deletion failed:", error);
} finally {
  await db.$disconnect();
  await pool.end();
}
