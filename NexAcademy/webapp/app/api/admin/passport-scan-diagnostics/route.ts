import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import prisma from "@/lib/prisma";

type DiagnosticUserRow = {
  userId: string;
  walletAddress: string;
  totalPoints: number;
  completedCampaigns: number;
  lastScannedAt: Date | null;
  consecutiveActiveWeeks: number;
  scanCadence: string;
  compositeScore: number;
};

type DiagnosticSummaryRow = {
  totalUsers: number;
  usersWithCompletedCampaigns: number;
  usersWithoutCompletedCampaigns: number;
  dueByCadence: number;
};

function parseInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = clamp(parseInteger(url.searchParams.get("limit"), 200), 1, 1000);
    const offset = Math.max(0, parseInteger(url.searchParams.get("offset"), 0));
    const onlyEligible = url.searchParams.get("eligibleOnly") === "1";
    const addressFilter = url.searchParams.get("address")?.trim().toLowerCase() ?? "";
    const jitterDays = clamp(parseInteger(url.searchParams.get("jitterDays"), 0), -2, 2);

    const weeklyThreshold = new Date();
    weeklyThreshold.setDate(weeklyThreshold.getDate() - (7 + jitterDays));

    const monthlyThreshold = new Date();
    monthlyThreshold.setDate(monthlyThreshold.getDate() - 30);

    const whereClause = addressFilter
      ? Prisma.sql`WHERE LOWER(u."walletAddress") = ${addressFilter}`
      : Prisma.empty;

    const [approvedWhitelistCount, summaryRows, diagnosticRows] = await Promise.all([
      prisma.partnerContractWhitelist.count({ where: { isApproved: true } }),
      prisma.$queryRaw<DiagnosticSummaryRow[]>(
        Prisma.sql`
          SELECT
            COUNT(*)::int AS "totalUsers",
            COUNT(*) FILTER (WHERE diag."completedCampaigns" > 0)::int AS "usersWithCompletedCampaigns",
            COUNT(*) FILTER (WHERE diag."completedCampaigns" = 0)::int AS "usersWithoutCompletedCampaigns",
            COUNT(*) FILTER (
              WHERE diag."completedCampaigns" > 0
                AND (
                  diag."lastScannedAt" IS NULL
                  OR (diag."scanCadence" = 'WEEKLY' AND diag."lastScannedAt" < ${weeklyThreshold})
                  OR (diag."scanCadence" = 'MONTHLY' AND diag."lastScannedAt" < ${monthlyThreshold})
                )
            )::int AS "dueByCadence"
          FROM (
            SELECT
              u."id",
              COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "completedCampaigns",
              ps."lastScannedAt",
              COALESCE(ps."scanCadence", 'WEEKLY')::text AS "scanCadence"
            FROM "User" u
            LEFT JOIN "CampaignParticipant" cp ON cp."userId" = u."id"
            LEFT JOIN "PassportScore" ps ON ps."userId" = u."id"
            ${whereClause}
            GROUP BY u."id", ps."lastScannedAt", ps."scanCadence"
          ) diag
        `,
      ),
      prisma.$queryRaw<DiagnosticUserRow[]>(
        Prisma.sql`
          SELECT
            u."id" AS "userId",
            u."walletAddress",
            u."totalPoints",
            COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "completedCampaigns",
            ps."lastScannedAt",
            COALESCE(ps."consecutiveActiveWeeks", 0)::int AS "consecutiveActiveWeeks",
            COALESCE(ps."scanCadence", 'WEEKLY')::text AS "scanCadence",
            COALESCE(ps."compositeScore", 0)::int AS "compositeScore"
          FROM "User" u
          LEFT JOIN "CampaignParticipant" cp ON cp."userId" = u."id"
          LEFT JOIN "PassportScore" ps ON ps."userId" = u."id"
          ${whereClause}
          GROUP BY
            u."id",
            u."walletAddress",
            u."totalPoints",
            ps."lastScannedAt",
            ps."consecutiveActiveWeeks",
            ps."scanCadence",
            ps."compositeScore"
          ORDER BY
            COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL) DESC,
            ps."lastScannedAt" ASC NULLS FIRST,
            u."walletAddress" ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `,
      ),
    ]);

    const alchemyConfigured = Boolean(process.env.ALCHEMY_RPC_URL);
    const baseReasons: string[] = [];
    if (!alchemyConfigured) {
      baseReasons.push("alchemy_rpc_url_missing");
    }
    if (approvedWhitelistCount === 0) {
      baseReasons.push("no_approved_whitelist_contracts");
    }

    const users = diagnosticRows
      .map((row) => {
        const hasCompletedCampaign = row.completedCampaigns > 0;
        const cadence = row.scanCadence === "MONTHLY" ? "MONTHLY" : "WEEKLY";
        const dueByCadence =
          row.lastScannedAt === null ||
          (cadence === "WEEKLY" && row.lastScannedAt < weeklyThreshold) ||
          (cadence === "MONTHLY" && row.lastScannedAt < monthlyThreshold);

        const reasons = [...baseReasons];
        if (!hasCompletedCampaign) {
          reasons.push("no_completed_campaign");
        } else if (!dueByCadence) {
          reasons.push(cadence === "MONTHLY" ? "not_due_monthly" : "not_due_weekly");
        }

        const eligibleForScanAttempt = reasons.length === 0;
        const nextEligibleAt =
          row.lastScannedAt === null
            ? null
            : new Date(
                row.lastScannedAt.getTime() +
                  (cadence === "MONTHLY" ? 30 : 7 + jitterDays) * 24 * 60 * 60 * 1000,
              );

        return {
          userId: row.userId,
          walletAddress: row.walletAddress,
          totalPoints: row.totalPoints,
          completedCampaigns: row.completedCampaigns,
          lastScannedAt: row.lastScannedAt,
          nextEligibleAt,
          scanCadence: cadence,
          consecutiveActiveWeeks: row.consecutiveActiveWeeks,
          passportCompositeScore: row.compositeScore,
          dueByCadence,
          eligibleForScanAttempt,
          needsOnChainActivityCheck: eligibleForScanAttempt,
          reasons,
        };
      })
      .filter((row) => (onlyEligible ? row.eligibleForScanAttempt : true));

    const summary = summaryRows[0] ?? {
      totalUsers: 0,
      usersWithCompletedCampaigns: 0,
      usersWithoutCompletedCampaigns: 0,
      dueByCadence: 0,
    };

    return NextResponse.json({
      configuration: {
        alchemyConfigured,
        approvedWhitelistCount,
        jitterDays,
        weeklyThreshold,
        monthlyThreshold,
        limit,
        offset,
        addressFilter: addressFilter || null,
        onlyEligible,
      },
      summary: {
        totalUsers: summary.totalUsers,
        usersWithCompletedCampaigns: summary.usersWithCompletedCampaigns,
        usersWithoutCompletedCampaigns: summary.usersWithoutCompletedCampaigns,
        dueByCadence: summary.dueByCadence,
        precheckEligible:
          alchemyConfigured && approvedWhitelistCount > 0 ? summary.dueByCadence : 0,
      },
      users,
      note:
        "eligibleForScanAttempt only means the user passes prechecks. A later Alchemy scan is still required to find qualifying activity against approved whitelist contracts in the last 30 days.",
    });
  } catch (error) {
    console.error("GET /api/admin/passport-scan-diagnostics error", error);
    return NextResponse.json(
      { error: "Failed to fetch passport scan diagnostics" },
      { status: 500 },
    );
  }
}
