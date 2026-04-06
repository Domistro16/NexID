import { NextResponse } from "next/server";
import type { BadgeType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { computeBehaviourMultiplier } from "@/lib/scorm/scoring";
import { BADGE_META } from "@/lib/services/badge-engine.service";
import { resolvePrimaryNamesByWallet } from "@/lib/services/domain-name.service";
import { getCumulativePartnerDisplayPointsByWallet } from "@/lib/services/onchain-points.service";

const LEADERBOARD_VISIBLE_LIMIT = 100;

type LeaderboardBaseRow = {
  userId: string;
  walletAddress: string;
  dbTotalPoints: number;
  campaignsFinished: number;
  totalScore: number;
  flaggedCount: number;
};

type BadgeRow = {
  id: string;
  userId: string;
  type: BadgeType;
};

type DisplayBadgeRow = {
  userId: string;
  badgeIds: unknown;
};

function selectBadgesForUser(
  userBadges: BadgeRow[],
  displayBadgeIds: string[] | undefined,
) {
  return (
    displayBadgeIds && displayBadgeIds.length > 0
      ? displayBadgeIds
          .map((badgeId) => userBadges.find((badge) => badge.id === badgeId))
          .filter((badge): badge is BadgeRow => Boolean(badge))
      : userBadges.slice(0, 3)
  );
}

function badgeTextForUser(
  userBadges: BadgeRow[],
  displayBadgeIds: string[] | undefined,
) {
  const badgesToRender = selectBadgesForUser(userBadges, displayBadgeIds);
  if (badgesToRender.length === 0) {
    return BADGE_META.VERIFIED.glyph;
  }

  return badgesToRender
    .map((badge) => BADGE_META[badge.type]?.glyph ?? BADGE_META.VERIFIED.glyph)
    .join("");
}

/**
 * GET /api/leaderboard
 * Public global leaderboard — returns top users ranked by cumulative points
 * stored for them on the partner campaign contracts,
 * including real badge display text and the real behaviour multiplier.
 */
export async function GET() {
  try {
    const baseRows = await prisma.$queryRaw<LeaderboardBaseRow[]>`
      SELECT
        u."id" AS "userId",
        u."walletAddress",
        u."totalPoints" AS "dbTotalPoints",
        COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "campaignsFinished",
        COALESCE(SUM(cp."score"), 0)::int AS "totalScore",
        COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL AND cp."score" = 0)::int AS "flaggedCount"
      FROM "User" u
      LEFT JOIN "CampaignParticipant" cp ON cp."userId" = u."id"
      WHERE u."walletAddress" IS NOT NULL
        AND u."walletAddress" <> ''
      GROUP BY u."id", u."walletAddress", u."totalPoints"
    `;

    if (baseRows.length === 0) {
      return NextResponse.json({ leaderboard: [] });
    }

    const displayPointsByWallet = await getCumulativePartnerDisplayPointsByWallet(
      baseRows.map((row) => row.walletAddress),
    );

    const rankedRows = baseRows
      .map((row) => {
        const normalizedWallet = row.walletAddress.toLowerCase();
        const onChainTotal = displayPointsByWallet.get(normalizedWallet);
        return {
          ...row,
          totalPoints: onChainTotal ?? (row.dbTotalPoints ?? 0),
        };
      })
      .filter((row) => row.totalPoints > 0 || row.campaignsFinished > 0 || row.totalScore > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints || b.totalScore - a.totalScore)
      .slice(0, LEADERBOARD_VISIBLE_LIMIT);

    const userIds = rankedRows.map((row) => row.userId);
    const walletAddresses = rankedRows.map((row) => row.walletAddress);
    const [passportScores, domainClaims, reverseResolvedNames, badges, displayBadges] = await Promise.all([
      prisma.passportScore.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          consecutiveActiveWeeks: true,
          crossProtocolCount: true,
        },
      }),
      prisma.domainClaim.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          walletAddress: true,
          domainName: true,
        },
        orderBy: [{ claimedAt: "desc" }],
      }),
      resolvePrimaryNamesByWallet(walletAddresses),
      prisma.badge.findMany({
        where: { userId: { in: userIds } },
        select: {
          id: true,
          userId: true,
          type: true,
        },
        orderBy: [{ userId: "asc" }, { earnedAt: "desc" }],
      }),
      prisma.userBadgeDisplay.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          badgeIds: true,
        },
      }),
    ]);

    const passportByUser = new Map(
      passportScores.map((row) => [
        row.userId,
        {
          consecutiveActiveWeeks: row.consecutiveActiveWeeks,
          crossProtocolCount: row.crossProtocolCount,
        },
      ]),
    );
    const userIdsWithDomain = new Set(domainClaims.map((row) => row.userId));

    const badgesByUser = new Map<string, BadgeRow[]>();
    for (const badge of badges as BadgeRow[]) {
      const current = badgesByUser.get(badge.userId);
      if (current) {
        current.push(badge);
      } else {
        badgesByUser.set(badge.userId, [badge]);
      }
    }

    const displayBadgeIdsByUser = new Map(
      (displayBadges as DisplayBadgeRow[]).map((row) => [
        row.userId,
        Array.isArray(row.badgeIds)
          ? row.badgeIds.filter((badgeId): badgeId is string => typeof badgeId === "string")
          : [],
      ]),
    );

    const leaderboard = rankedRows.map((row, index) => {
      const userBadges = badgesByUser.get(row.userId) ?? [];
      const passport = passportByUser.get(row.userId);
      const specialistBadgeCount = userBadges.filter(
        (badge) => badge.type === "PROTOCOL_SPECIALIST",
      ).length;
      const hasPassedAgentSession = userBadges.some(
        (badge) => badge.type === "AGENT_CERTIFIED",
      );
      const multiplier = computeBehaviourMultiplier({
        completedCampaignCount: row.campaignsFinished,
        averageQuizScore:
          row.campaignsFinished > 0 ? row.totalScore / row.campaignsFinished : 0,
        hasAnyFlags: row.flaggedCount > 0,
        consecutiveActiveWeeks: passport?.consecutiveActiveWeeks ?? 0,
        hasPassedAgentSession,
        crossProtocolCount: passport?.crossProtocolCount ?? 0,
        hasDomain: userIdsWithDomain.has(row.userId),
        protocolSpecialistBadgeCount: specialistBadgeCount,
      });

      return {
        rank: index + 1,
        walletAddress: row.walletAddress,
        displayName: reverseResolvedNames.get(row.walletAddress.toLowerCase()) ?? null,
        totalPoints: row.totalPoints,
        campaignsFinished: row.campaignsFinished,
        totalScore: row.totalScore,
        badgeDisplayText: badgeTextForUser(
          userBadges,
          displayBadgeIdsByUser.get(row.userId),
        ),
        badgeDisplayItems: selectBadgesForUser(
          userBadges,
          displayBadgeIdsByUser.get(row.userId),
        ).map((badge) => ({
          id: badge.id,
          type: badge.type,
          glyph: BADGE_META[badge.type]?.glyph ?? BADGE_META.VERIFIED.glyph,
          name: BADGE_META[badge.type]?.name ?? badge.type,
          description: BADGE_META[badge.type]?.description ?? "",
        })),
        multiplierTotal: multiplier.total,
      };
    });

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error("GET /api/leaderboard error", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 },
    );
  }
}
