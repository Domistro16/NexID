import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { getRewardSummary } from "@/lib/services/rewardService";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ rewards: await getRewardSummary(user?.id) });
}
