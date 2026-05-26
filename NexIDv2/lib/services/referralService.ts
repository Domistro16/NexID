import { cleanReferralCode } from "@/lib/referrals";
import { withDatabase } from "@/lib/server/db";
import { detectReferralRisk } from "@/lib/services/antiGamingService";
import type { ReferralStats } from "@/lib/types/nexid";

export async function referralSummary(userId?: string) {
  return withDatabase<ReferralStats>(
    async (db) => {
      const referrals = await db.referral.findMany({ where: userId ? { referrerUserId: userId } : undefined });
      const mintRows = referrals.filter((r) => Boolean(r.mintName));
      return {
        clicks: referrals.reduce((sum, r) => sum + r.clicks, 0),
        signups: referrals.reduce((sum, r) => sum + r.signups, 0),
        mints: mintRows.length,
        pending: mintRows.filter((r) => r.status === "pending").reduce((sum, r) => sum + r.rewardAmount, 0),
        paid: mintRows.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.rewardAmount, 0),
        copied: 0,
        shared: 0
      };
    },
    async () => ({ clicks: 0, signups: 0, mints: 0, pending: 0, paid: 0, copied: 0, shared: 0 })
  );
}

export function referralRewardForMint(price: number) {
  return +(price * 0.25).toFixed(2);
}

export async function recordReferralClick(code: string) {
  const referrerIdName = cleanReferralCode(code);
  if (!referrerIdName) throw new Error("Invalid referral code");
  return withDatabase<{ code: string; clicks: number }>(
    async (db) => {
      const referrer = await db.user.findFirst({
        where: {
          OR: [
            { primaryIdName: referrerIdName },
            { displayName: `${referrerIdName}.id` }
          ]
        }
      });
      const row = await db.referral.upsert({
        where: { id: `click_${referrerIdName}` },
        update: { clicks: { increment: 1 }, referrerUserId: referrer?.id },
        create: {
          id: `click_${referrerIdName}`,
          referrerUserId: referrer?.id,
          referrerIdName,
          mintPrice: 0,
          rewardAmount: 0,
          clicks: 1,
          status: "tracking"
        }
      });
      return { code: referrerIdName, clicks: row.clicks };
    },
    async () => ({ code: referrerIdName, clicks: 1 })
  );
}

export async function recordReferralMint(input: {
  referrerIdName: string;
  mintName: string;
  mintPrice: number;
  referredUserId?: string;
}) {
  const referrerIdName = cleanReferralCode(input.referrerIdName);
  if (!referrerIdName) throw new Error("Invalid referral code");
  const riskFlag = detectReferralRisk({ referrer: referrerIdName, referred: input.mintName });
  return withDatabase<{
    id: string;
    referrerIdName: string;
    mintName: string | null;
    mintPrice: number;
    rewardAmount: number;
    status: string;
    riskFlag: string | null;
  }>(
    async (db) => {
      const referrer = await db.user.findFirst({
        where: {
          OR: [
            { primaryIdName: referrerIdName },
            { displayName: `${referrerIdName}.id` }
          ]
        }
      });
      const row = await db.referral.create({
        data: {
          referrerUserId: referrer?.id,
          referredUserId: input.referredUserId,
          referrerIdName,
          mintName: input.mintName,
          mintPrice: input.mintPrice,
          rewardAmount: referralRewardForMint(input.mintPrice),
          status: riskFlag ? "blocked" : "pending",
          riskFlag
        }
      });
      return row;
    },
    async () => ({
      id: `ref_${Date.now()}`,
      referrerIdName,
      mintName: input.mintName,
      mintPrice: input.mintPrice,
      rewardAmount: referralRewardForMint(input.mintPrice),
      status: riskFlag ? "blocked" : "pending",
      riskFlag
    })
  );
}

export async function listReferralEvents(userId?: string) {
  return withDatabase(
    async (db) => {
      if (!userId) return [];
      const rows = await db.referral.findMany({ where: { referrerUserId: userId }, orderBy: { createdAt: "desc" }, take: 10 });
      return rows.map((row) => ({
        id: row.id,
        title: row.status === "paid" ? "Referral paid" : "Referral pending",
        sub: row.mintName ? `${row.mintName}.id mint` : "Tracked referral",
        amount: `$${row.rewardAmount.toFixed(2)}`
      }));
    },
    async () => []
  );
}
