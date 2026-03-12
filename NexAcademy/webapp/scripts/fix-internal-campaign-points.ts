import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CandidateRow = {
  participantId: string;
  campaignId: number;
  campaignTitle: string;
  ownerType: string;
  contractType: string;
  userId: string;
  walletAddress: string;
  participantScore: number;
  userTotalPoints: number;
  completedAt: Date | null;
};

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
  };
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));

  const rows = await prisma.$queryRaw<CandidateRow[]>`
    SELECT
      cp."id" AS "participantId",
      cp."campaignId" AS "campaignId",
      c."title" AS "campaignTitle",
      c."ownerType"::text AS "ownerType",
      c."contractType"::text AS "contractType",
      cp."userId" AS "userId",
      u."walletAddress" AS "walletAddress",
      cp."score" AS "participantScore",
      u."totalPoints" AS "userTotalPoints",
      cp."completedAt" AS "completedAt"
    FROM "CampaignParticipant" cp
    INNER JOIN "Campaign" c ON c."id" = cp."campaignId"
    INNER JOIN "User" u ON u."id" = cp."userId"
    WHERE cp."completedAt" IS NOT NULL
      AND cp."score" > 0
      AND (
        c."ownerType" = 'NEXID'
        OR c."contractType" = 'NEXID_CAMPAIGNS'
      )
    ORDER BY cp."completedAt" ASC, cp."campaignId" ASC
  `;

  if (rows.length === 0) {
    console.log("No completed internal campaigns with non-zero scores were found.");
    return;
  }

  const deductionsByUser = new Map<
    string,
    {
      userId: string;
      walletAddress: string;
      currentTotalPoints: number;
      deduction: number;
      participantIds: string[];
    }
  >();

  let totalScoreToReverse = 0;

  console.log(`Found ${rows.length} completed internal campaign records with non-zero scores.\n`);

  for (const row of rows) {
    totalScoreToReverse += row.participantScore;
    console.log(
      [
        `campaign=${row.campaignId}`,
        `title="${row.campaignTitle}"`,
        `wallet=${row.walletAddress}`,
        `participantScore=${row.participantScore}`,
        `completedAt=${row.completedAt?.toISOString() ?? "null"}`,
      ].join(" | "),
    );

    const existing = deductionsByUser.get(row.userId);
    if (existing) {
      existing.deduction += row.participantScore;
      existing.participantIds.push(row.participantId);
      continue;
    }

    deductionsByUser.set(row.userId, {
      userId: row.userId,
      walletAddress: row.walletAddress,
      currentTotalPoints: row.userTotalPoints,
      deduction: row.participantScore,
      participantIds: [row.participantId],
    });
  }

  console.log("\nPer-user impact:");
  for (const entry of deductionsByUser.values()) {
    const nextTotalPoints = entry.currentTotalPoints - entry.deduction;
    console.log(
      [
        `wallet=${entry.walletAddress}`,
        `current=${entry.currentTotalPoints}`,
        `deduction=${entry.deduction}`,
        `next=${nextTotalPoints}`,
        `records=${entry.participantIds.length}`,
      ].join(" | "),
    );
  }

  const underflowUsers = Array.from(deductionsByUser.values()).filter(
    (entry) => entry.currentTotalPoints < entry.deduction,
  );

  console.log(`\nSummary: users=${deductionsByUser.size} | scoreToReverse=${totalScoreToReverse}`);

  if (underflowUsers.length > 0) {
    console.error("\nAborting because some users would go below zero:");
    for (const entry of underflowUsers) {
      console.error(
        [
          `wallet=${entry.walletAddress}`,
          `current=${entry.currentTotalPoints}`,
          `deduction=${entry.deduction}`,
        ].join(" | "),
      );
    }
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to reset participant scores and subtract the matching user points.");
    return;
  }

  for (const entry of deductionsByUser.values()) {
    await prisma.$transaction([
      prisma.campaignParticipant.updateMany({
        where: {
          id: { in: entry.participantIds },
        },
        data: {
          score: 0,
        },
      }),
      prisma.user.update({
        where: { id: entry.userId },
        data: {
          totalPoints: {
            decrement: entry.deduction,
          },
        },
      }),
    ]);
  }

  console.log("\nApplied cleanup successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to fix internal campaign points:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
