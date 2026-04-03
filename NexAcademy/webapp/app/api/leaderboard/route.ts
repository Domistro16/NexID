import { NextResponse } from "next/server";
import type { BadgeType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { computeBehaviourMultiplier } from "@/lib/scorm/scoring";
import { BADGE_META } from "@/lib/services/badge-engine.service";
import { getCumulativePartnerOnChainPointsByWallet } from "@/lib/services/onchain-points.service";

const LEADERBOARD_CANDIDATE_LIMIT = 250;
const LEADERBOARD_VISIBLE_LIMIT = 100;

type LeaderboardBaseRow = {
  userId: string;
  walletAddress: string;
  totalPoints: number;
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

function badgeTextForUser(
  userBadges: BadgeRow[],
  displayBadgeIds: string[] | undefined,
) {
  const selectedBadges =
    displayBadgeIds && displayBadgeIds.length > 0
      ? displayBadgeIds
          .map((badgeId) => userBadges.find((badge) => badge.id === badgeId))
          .filter((badge): badge is BadgeRow => Boolean(badge))
      : userBadges.slice(0, 3);

  const badgesToRender = selectedBadges.length > 0 ? selectedBadges : userBadges.slice(0, 3);
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
        u."totalPoints",
        COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "campaignsFinished",
        COALESCE(SUM(cp."score"), 0)::int AS "totalScore",
        COUNT(cp."id") FILTER (WHERE cp."completedAt" IS NOT NULL AND cp."score" = 0)::int AS "flaggedCount"
      FROM "User" u
      LEFT JOIN "CampaignParticipant" cp ON cp."userId" = u."id"
      GROUP BY u."id", u."walletAddress", u."totalPoints"
      ORDER BY u."totalPoints" DESC, "totalScore" DESC
      LIMIT ${LEADERBOARD_CANDIDATE_LIMIT}
    `;

    if (baseRows.length === 0) {
      return NextResponse.json({ leaderboard: [] });
    }

    const onChainPointsByWallet = await getCumulativePartnerOnChainPointsByWallet(
      baseRows.map((row) => row.walletAddress),
    );

    const rankedRows = baseRows
      .map((row) => ({
        ...row,
        totalPoints: onChainPointsByWallet.get(row.walletAddress.toLowerCase()) ?? 0,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints || b.totalScore - a.totalScore)
      .slice(0, LEADERBOARD_VISIBLE_LIMIT);

    const userIds = rankedRows.map((row) => row.userId);
    const [passportScores, domainClaims, badges, displayBadges] = await Promise.all([
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
        select: { userId: true },
      }),
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
        totalPoints: row.totalPoints,
        campaignsFinished: row.campaignsFinished,
        totalScore: row.totalScore,
        badgeDisplayText: badgeTextForUser(
          userBadges,
          displayBadgeIdsByUser.get(row.userId),
        ),
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
