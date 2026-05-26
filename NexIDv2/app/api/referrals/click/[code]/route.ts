import { NextResponse } from "next/server";
import { cleanReferralCode } from "@/lib/referrals";
import { recordReferralClick } from "@/lib/services/referralService";

async function trackClick(rawCode: string) {
  const code = cleanReferralCode(rawCode);
  if (!code) return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
  const referral = await recordReferralClick(code);
  return NextResponse.json({ referral });
}

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return trackClick(code);
}

export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return trackClick(code);
}
