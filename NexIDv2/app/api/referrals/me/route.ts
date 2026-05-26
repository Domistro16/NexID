import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { referralSummary } from "@/lib/services/referralService";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ referrals: await referralSummary(user?.id) });
}
