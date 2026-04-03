import { NextRequest, NextResponse } from "next/server";
import { syncPartnerCampaignPointsToChain } from "@/lib/services/points-sync.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/sync-points
 *
 * Scheduled job (run every day at 12:00 AM) that syncs campaign participant
 * scores from the database to the PartnerCampaigns contract on-chain using
 * batchAddPoints().
 *
 * For each LIVE partner campaign with an on-chain ID, it:
 * 1. Reads all participant scores from DB
 * 2. Batch-reads their current on-chain points via multicall
 * 3. Computes the delta (DB score − on-chain points)
 * 4. Calls batchAddPoints with the deltas for users who have earned new points
 *
 * Protected by CRON_SECRET header to prevent unauthorized access.
 */

async function handleSyncPoints(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await syncPartnerCampaignPointsToChain());
  } catch (error) {
    console.error("Cron sync-points error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync points" },
      { status: error instanceof Error && error.message.includes("not configured") ? 503 : 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleSyncPoints(request);
}

export async function GET(request: NextRequest) {
  return handleSyncPoints(request);
}
