import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import { syncPartnerCampaignPointsToChain } from "@/lib/services/points-sync.service";

export async function POST(request: NextRequest) {
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    return NextResponse.json(await syncPartnerCampaignPointsToChain());
  } catch (error) {
    console.error("POST /api/admin/sync-points error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync points" },
      { status: error instanceof Error && error.message.includes("not configured") ? 503 : 500 },
    );
  }
}
