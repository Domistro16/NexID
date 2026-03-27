import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Proof of Outcome Service
//
// Strategy: "This is what you sell to protocols. Every campaign generates a
// dashboard that protocols can screenshot, share with investors, and use to
// justify spend."
//
// Two tiers:
//   1. Public — platform-wide aggregate (sales tool + user trust)
//   2. Protocol — campaign-specific deep analytics (private, per-partner)
// ─────────────────────────────────────────────────────────────────────────────

// ─── Type definitions ────────────────────────────────────────────────────────

export interface PublicProofOfOutcome {
    /** Platform-wide bot removal rate (% of flagged participants) */
    botRemovalRate: number;
    /** Average comprehension/quiz score across all completed campaigns */
    averageComprehensionScore: number;
    /** On-chain action success rate (completed with on-chain tx / total completed) */
    onChainActionSuccessRate: number;
    /** Score distribution histogram (buckets: 0-20, 20-40, 40-60, 60-80, 80-100) */
    scoreDistribution: number[];
    /** User quality segments (anonymised) */
    qualitySegments: {
        chartered: number;
        consistent: number;
        verified: number;
        unverified: number;
    };
    /** Total rewards distributed across all campaigns (USDC) */
    totalRewardsDistributed: string;
    /** Total campaigns completed platform-wide */
    totalCampaignsCompleted: number;
    /** Total unique participants */
    totalUniqueParticipants: number;
    /** Platform averages for benchmark comparison */
    benchmarks: {
        avgCompletionRate: number;
        avgQuizScore: number;
        avgPostCampaignReturnRate: number;
    };
}

export interface ProtocolProofOfOutcome {
    campaignId: number;
    campaignTitle: string;
    /** Bot removal rate specific to this campaign */
    botRemovalRate: number;
    /** Completion rate for this campaign */
    completionRate: number;
    /** Average quiz score for this campaign */
    averageQuizScore: number;
    /** On-chain action failure points (enrolled but didn't complete on-chain) */
    onChainFailureCount: number;
    /** 30-day post-campaign return rate (users who interacted with protocol after campaign) */
    postCampaignReturnRate: number;
    /** Number of users who returned post-campaign */
    postCampaignReturnCount: number;
    /** Score distribution for this campaign */
    scoreDistribution: number[];
    /** User quality breakdown for this campaign's participants */
    qualitySegments: {
        chartered: number;
        consistent: number;
        verified: number;
        unverified: number;
    };
    /** Volume generated post-campaign (tx count from passport scans) */
    postCampaignVolume: number;
    /** Platform benchmark comparison */
    vsPlatformAvg: {
        completionRate: number;
        quizScore: number;
        returnRate: number;
    };
    /** Participant count */
    totalParticipants: number;
    /** Completed count */
    totalCompleted: number;

    // ── Extended Bot Exclusion Report ─────────────────────────────────────
    /** Number of identified sybil clusters */
    sybilClustersIdentified: number;
    /** Breakdown of sybil flags by reason */
    sybilFlagBreakdown: Array<{ reason: string; count: number }>;
    /** Breakdown of engagement flags by type */
    engagementFlagBreakdown: Array<{ type: string; count: number }>;
    /** Number of shadow-banned users in this campaign */
    shadowBannedCount: number;
    /** Number of users flagged for AI-generated content */
    aiContentFlaggedCount: number;
    /** Clean user count (total - flagged) */
    cleanUserCount: number;
}

// ─── Score distribution helper ───────────────────────────────────────────────

type ScoreBucketRow = { bucket: number; count: number };

function buildHistogram(rows: ScoreBucketRow[]): number[] {
    const histogram = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
    for (const row of rows) {
        const idx = Math.min(4, Math.max(0, row.bucket));
        histogram[idx] = row.count;
    }
    return histogram;
}

// ─── Public Dashboard ────────────────────────────────────────────────────────

export async function getPublicProofOfOutcome(): Promise<PublicProofOfOutcome> {
    const [
        participantStats,
        flaggedCount,
        scoreDistRows,
        badgeCounts,
        rewardsResult,
        campaignCount,
        onChainStats,
        returnRateResult,
    ] = await Promise.all([
        // Aggregate participant metrics
        prisma.$queryRaw<
            Array<{
                totalParticipants: number;
                totalCompleted: number;
                avgScore: number;
            }>
        >`
            SELECT
                COUNT(DISTINCT "userId")::int AS "totalParticipants",
                COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL)::int AS "totalCompleted",
                COALESCE(AVG("score") FILTER (WHERE "completedAt" IS NOT NULL AND "score" > 0), 0)::float AS "avgScore"
            FROM "CampaignParticipant"
        `,

        // Flagged participants (score = 0 on completed campaigns)
        prisma.campaignParticipant.count({
            where: { completedAt: { not: null }, score: 0 },
        }),

        // Score distribution in 5 buckets
        prisma.$queryRaw<ScoreBucketRow[]>`
            SELECT
                LEAST(FLOOR("score" / 20.0)::int, 4) AS "bucket",
                COUNT(*)::int AS "count"
            FROM "CampaignParticipant"
            WHERE "completedAt" IS NOT NULL AND "score" > 0
            GROUP BY "bucket"
            ORDER BY "bucket"
        `,

        // Badge-based quality segments
        prisma.$queryRaw<
            Array<{ type: string; cnt: number }>
        >`
            SELECT "type"::text, COUNT(DISTINCT "userId")::int AS "cnt"
            FROM "Badge"
            WHERE "type" IN ('CHARTERED', 'CONSISTENT', 'VERIFIED')
            GROUP BY "type"
        `,

        // Total rewards distributed
        prisma.$queryRaw<Array<{ total: string }>>`
            SELECT COALESCE(SUM("totalDistributedUsdc"), 0)::text AS "total"
            FROM "CampaignRewardDistribution"
        `,

        // Total distinct campaigns with completions
        prisma.$queryRaw<Array<{ cnt: number }>>`
            SELECT COUNT(DISTINCT "campaignId")::int AS "cnt"
            FROM "CampaignParticipant"
            WHERE "completedAt" IS NOT NULL
        `,

        // On-chain completion stats
        prisma.$queryRaw<
            Array<{ completedWithTx: number; totalCompleted: number }>
        >`
            SELECT
                COUNT(*) FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "totalCompleted",
                COUNT(*) FILTER (WHERE cp."completedAt" IS NOT NULL AND bt."id" IS NOT NULL)::int AS "completedWithTx"
            FROM "CampaignParticipant" cp
            LEFT JOIN "BlockchainTx" bt ON bt."userId" = cp."userId" AND bt."campaignId" = cp."campaignId"
        `,

        // Post-campaign return rate (users with passport scans showing activity after campaign completion)
        prisma.$queryRaw<Array<{ returnRate: number }>>`
            SELECT
                CASE WHEN COUNT(DISTINCT cp."userId") = 0 THEN 0
                ELSE ROUND(
                    COUNT(DISTINCT wsl."userId")::numeric / COUNT(DISTINCT cp."userId")::numeric * 100, 1
                )::float
                END AS "returnRate"
            FROM "CampaignParticipant" cp
            LEFT JOIN "WalletScanLog" wsl
                ON wsl."userId" = cp."userId"
                AND wsl."scanDate" > cp."completedAt"
                AND wsl."txCount" > 0
            WHERE cp."completedAt" IS NOT NULL
        `,
    ]);

    const stats = participantStats[0] ?? {
        totalParticipants: 0,
        totalCompleted: 0,
        avgScore: 0,
    };

    const totalCompleted = stats.totalCompleted;
    const botRemovalRate =
        totalCompleted > 0
            ? Math.round((flaggedCount / (totalCompleted + flaggedCount)) * 1000) / 10
            : 0;

    const onChain = onChainStats[0] ?? { completedWithTx: 0, totalCompleted: 0 };
    const onChainSuccessRate =
        onChain.totalCompleted > 0
            ? Math.round((onChain.completedWithTx / onChain.totalCompleted) * 1000) / 10
            : 0;

    // Map badge counts to segments
    const badgeMap = new Map(badgeCounts.map((b) => [b.type, b.cnt]));
    const charteredCount = badgeMap.get('CHARTERED') ?? 0;
    const consistentCount = badgeMap.get('CONSISTENT') ?? 0;
    const verifiedCount = badgeMap.get('VERIFIED') ?? 0;

    const completionRate =
        stats.totalParticipants > 0
            ? Math.round((totalCompleted / stats.totalParticipants) * 1000) / 10
            : 0;

    return {
        botRemovalRate,
        averageComprehensionScore: Math.round(stats.avgScore * 10) / 10,
        onChainActionSuccessRate: onChainSuccessRate,
        scoreDistribution: buildHistogram(scoreDistRows),
        qualitySegments: {
            chartered: charteredCount,
            consistent: consistentCount,
            verified: verifiedCount,
            unverified: Math.max(
                0,
                stats.totalParticipants - charteredCount - consistentCount - verifiedCount,
            ),
        },
        totalRewardsDistributed: rewardsResult[0]?.total ?? '0',
        totalCampaignsCompleted: campaignCount[0]?.cnt ?? 0,
        totalUniqueParticipants: stats.totalParticipants,
        benchmarks: {
            avgCompletionRate: completionRate,
            avgQuizScore: Math.round(stats.avgScore * 10) / 10,
            avgPostCampaignReturnRate: returnRateResult[0]?.returnRate ?? 0,
        },
    };
}

// ─── Protocol Dashboard (campaign-specific) ──────────────────────────────────

export async function getProtocolProofOfOutcome(
    campaignId: number,
): Promise<ProtocolProofOfOutcome | null> {
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, title: true, sponsorName: true },
    });

    if (!campaign) return null;

    const [
        participantStats,
        flaggedCount,
        scoreDistRows,
        badgeCounts,
        returnStats,
        postCampaignVolume,
        platformBenchmarks,
    ] = await Promise.all([
        // Campaign participant metrics
        prisma.$queryRaw<
            Array<{
                totalParticipants: number;
                totalCompleted: number;
                avgScore: number;
                onChainFailures: number;
            }>
        >`
            SELECT
                COUNT(*)::int AS "totalParticipants",
                COUNT(*) FILTER (WHERE cp."completedAt" IS NOT NULL)::int AS "totalCompleted",
                COALESCE(AVG(cp."score") FILTER (WHERE cp."completedAt" IS NOT NULL AND cp."score" > 0), 0)::float AS "avgScore",
                COUNT(*) FILTER (WHERE cp."completedAt" IS NULL AND cp."enrolledAt" < NOW() - INTERVAL '7 days')::int AS "onChainFailures"
            FROM "CampaignParticipant" cp
            WHERE cp."campaignId" = ${campaignId}
        `,

        // Flagged in this campaign
        prisma.campaignParticipant.count({
            where: { campaignId, completedAt: { not: null }, score: 0 },
        }),

        // Score distribution for this campaign
        prisma.$queryRaw<ScoreBucketRow[]>`
            SELECT
                LEAST(FLOOR("score" / 20.0)::int, 4) AS "bucket",
                COUNT(*)::int AS "count"
            FROM "CampaignParticipant"
            WHERE "campaignId" = ${campaignId} AND "completedAt" IS NOT NULL AND "score" > 0
            GROUP BY "bucket"
            ORDER BY "bucket"
        `,

        // Quality segments for this campaign's participants
        prisma.$queryRaw<Array<{ type: string; cnt: number }>>`
            SELECT b."type"::text, COUNT(DISTINCT b."userId")::int AS "cnt"
            FROM "Badge" b
            INNER JOIN "CampaignParticipant" cp ON cp."userId" = b."userId"
            WHERE cp."campaignId" = ${campaignId}
              AND b."type" IN ('CHARTERED', 'CONSISTENT', 'VERIFIED')
            GROUP BY b."type"
        `,

        // 30-day post-campaign return rate
        prisma.$queryRaw<
            Array<{ totalCompleted: number; returnedCount: number }>
        >`
            SELECT
                COUNT(DISTINCT cp."userId")::int AS "totalCompleted",
                COUNT(DISTINCT wsl."userId")::int AS "returnedCount"
            FROM "CampaignParticipant" cp
            LEFT JOIN "WalletScanLog" wsl
                ON wsl."userId" = cp."userId"
                AND wsl."scanDate" BETWEEN cp."completedAt" AND cp."completedAt" + INTERVAL '30 days'
                AND wsl."txCount" > 0
            WHERE cp."campaignId" = ${campaignId}
              AND cp."completedAt" IS NOT NULL
        `,

        // Post-campaign volume (total tx count from scans after completion)
        prisma.$queryRaw<Array<{ totalTx: number }>>`
            SELECT COALESCE(SUM(wsl."txCount"), 0)::int AS "totalTx"
            FROM "WalletScanLog" wsl
            INNER JOIN "CampaignParticipant" cp
                ON cp."userId" = wsl."userId"
            WHERE cp."campaignId" = ${campaignId}
              AND cp."completedAt" IS NOT NULL
              AND wsl."scanDate" > cp."completedAt"
        `,

        // Platform benchmarks for comparison
        prisma.$queryRaw<
            Array<{
                avgCompletionRate: number;
                avgQuizScore: number;
                avgReturnRate: number;
            }>
        >`
            SELECT
                CASE WHEN COUNT(*) = 0 THEN 0
                ELSE ROUND(
                    COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL)::numeric / COUNT(*)::numeric * 100, 1
                )::float
                END AS "avgCompletionRate",
                COALESCE(AVG("score") FILTER (WHERE "completedAt" IS NOT NULL AND "score" > 0), 0)::float AS "avgQuizScore",
                0::float AS "avgReturnRate"
            FROM "CampaignParticipant"
        `,
    ]);

    const stats = participantStats[0] ?? {
        totalParticipants: 0,
        totalCompleted: 0,
        avgScore: 0,
        onChainFailures: 0,
    };

    const returnData = returnStats[0] ?? {
        totalCompleted: 0,
        returnedCount: 0,
    };

    const botRemovalRate =
        stats.totalCompleted > 0
            ? Math.round((flaggedCount / (stats.totalCompleted + flaggedCount)) * 1000) / 10
            : 0;

    const completionRate =
        stats.totalParticipants > 0
            ? Math.round((stats.totalCompleted / stats.totalParticipants) * 1000) / 10
            : 0;

    const postCampaignReturnRate =
        returnData.totalCompleted > 0
            ? Math.round(
                  (returnData.returnedCount / returnData.totalCompleted) * 1000,
              ) / 10
            : 0;

    const badgeMap = new Map(badgeCounts.map((b) => [b.type, b.cnt]));
    const charteredCount = badgeMap.get('CHARTERED') ?? 0;
    const consistentCount = badgeMap.get('CONSISTENT') ?? 0;
    const verifiedCount = badgeMap.get('VERIFIED') ?? 0;

    const bench = platformBenchmarks[0] ?? {
        avgCompletionRate: 0,
        avgQuizScore: 0,
        avgReturnRate: 0,
    };

    // ── Extended Bot Exclusion Report queries ──────────────────────────────

    // Sybil flag breakdown by reason for this campaign's participants
    const sybilFlagBreakdown = await prisma.$queryRaw<
        Array<{ reason: string; count: number }>
    >`
        SELECT sf."reason", COUNT(*)::int AS "count"
        FROM "SybilFlag" sf
        INNER JOIN "CampaignParticipant" cp ON cp."userId" = sf."userId"
        WHERE cp."campaignId" = ${campaignId}
        GROUP BY sf."reason"
        ORDER BY "count" DESC
    `;

    // Engagement flag breakdown by type
    const engagementFlagBreakdown = await prisma.$queryRaw<
        Array<{ type: string; count: number }>
    >`
        SELECT "flagType" AS "type", COUNT(*)::int AS "count"
        FROM "EngagementFlag"
        WHERE "campaignId" = ${campaignId}
        GROUP BY "flagType"
        ORDER BY "count" DESC
    `;

    // Shadow-banned users in this campaign
    const shadowBannedResult = await prisma.$queryRaw<
        Array<{ count: number }>
    >`
        SELECT COUNT(*)::int AS "count"
        FROM "CampaignParticipant" cp
        INNER JOIN "User" u ON u."id" = cp."userId"
        WHERE cp."campaignId" = ${campaignId}
          AND u."shadowBanned" = true
    `;
    const shadowBannedCount = shadowBannedResult[0]?.count ?? 0;

    // AI content flagged count
    const aiContentResult = await prisma.$queryRaw<
        Array<{ count: number }>
    >`
        SELECT COUNT(*)::int AS "count"
        FROM "SybilFlag" sf
        INNER JOIN "CampaignParticipant" cp ON cp."userId" = sf."userId"
        WHERE cp."campaignId" = ${campaignId}
          AND sf."reason" = 'AI_GENERATED_CONTENT'
    `;
    const aiContentFlaggedCount = aiContentResult[0]?.count ?? 0;

    // Sybil clusters: count distinct IP/device clusters
    const clusterResult = await prisma.$queryRaw<
        Array<{ count: number }>
    >`
        SELECT COUNT(DISTINCT sf."evidence"->>'clusterHash')::int AS "count"
        FROM "SybilFlag" sf
        INNER JOIN "CampaignParticipant" cp ON cp."userId" = sf."userId"
        WHERE cp."campaignId" = ${campaignId}
          AND sf."reason" IN ('IP_CLUSTER', 'DEVICE_FINGERPRINT_CLUSTER')
          AND sf."evidence"->>'clusterHash' IS NOT NULL
    `;
    const sybilClustersIdentified = clusterResult[0]?.count ?? 0;

    const cleanUserCount = Math.max(0, stats.totalCompleted - shadowBannedCount);

    return {
        campaignId,
        campaignTitle: campaign.title,
        botRemovalRate,
        completionRate,
        averageQuizScore: Math.round(stats.avgScore * 10) / 10,
        onChainFailureCount: stats.onChainFailures,
        postCampaignReturnRate,
        postCampaignReturnCount: returnData.returnedCount,
        scoreDistribution: buildHistogram(scoreDistRows),
        qualitySegments: {
            chartered: charteredCount,
            consistent: consistentCount,
            verified: verifiedCount,
            unverified: Math.max(
                0,
                stats.totalParticipants - charteredCount - consistentCount - verifiedCount,
            ),
        },
        postCampaignVolume: postCampaignVolume[0]?.totalTx ?? 0,
        vsPlatformAvg: {
            completionRate: bench.avgCompletionRate,
            quizScore: Math.round(bench.avgQuizScore * 10) / 10,
            returnRate: bench.avgReturnRate,
        },
        totalParticipants: stats.totalParticipants,
        totalCompleted: stats.totalCompleted,
        // Extended Bot Exclusion Report
        sybilClustersIdentified,
        sybilFlagBreakdown,
        engagementFlagBreakdown,
        shadowBannedCount,
        aiContentFlaggedCount,
        cleanUserCount,
    };
}
