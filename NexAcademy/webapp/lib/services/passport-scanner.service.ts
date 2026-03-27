import prisma from '@/lib/prisma';
import { evaluateBadges } from './badge-engine.service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WhitelistedContract {
    chainId: number;
    contractAddress: string;
    actionType: string;
}

interface WalletActivity {
    chainId: number;
    contractAddress: string;
    actionType: string;
    /** ISO date strings of the days this interaction occurred */
    activeDates: string[];
    txCount: number;
}

interface ScanResult {
    userId: string;
    walletAddress: string;
    chainId: number;
    activities: WalletActivity[];
    activeDays: number;
    totalTxCount: number;
}

interface ScoreBreakdown {
    frequencyScore: number;
    recencyScore: number;
    depthScore: number;
    varietyScore: number;
    volumeTier: number;
    compositeScore: number;
    consecutiveActiveWeeks: number;
    crossProtocolCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVM Scanner — Alchemy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch asset transfers for a wallet from Alchemy, filtered to only
 * interactions with whitelisted contract addresses.
 *
 * Uses alchemy_getAssetTransfers — the free tier supports ~300 CU per call,
 * which is enough for batched weekly scanning of up to ~50k wallets.
 */
async function scanEvmWallet(
    walletAddress: string,
    contracts: WhitelistedContract[],
    fromDate: Date,
    toDate: Date,
): Promise<WalletActivity[]> {
    const alchemyUrl = process.env.ALCHEMY_RPC_URL;
    if (!alchemyUrl) return [];

    if (contracts.length === 0) return [];

    const contractSet = new Map(
        contracts.map((c) => [c.contractAddress.toLowerCase(), c]),
    );

    const activities: WalletActivity[] = [];

    try {
        // Fetch outgoing transfers TO whitelisted contracts
        const response = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'alchemy_getAssetTransfers',
                params: [
                    {
                        fromAddress: walletAddress,
                        toAddress: undefined,
                        fromBlock: '0x0',
                        toBlock: 'latest',
                        category: [
                            'external',
                            'erc20',
                            'erc721',
                            'erc1155',
                        ],
                        withMetadata: true,
                        maxCount: '0x3E8', // 1000
                    },
                ],
            }),
        });

        const data = await response.json();
        const transfers = data?.result?.transfers ?? [];

        // Group by contract
        const contractMap = new Map<
            string,
            { dates: Set<string>; txCount: number }
        >();

        for (const tx of transfers) {
            const toAddr = (tx.to ?? '').toLowerCase();
            const whitelisted = contractSet.get(toAddr);
            if (!whitelisted) continue;

            const txDate = new Date(tx.metadata?.blockTimestamp ?? 0);
            if (txDate < fromDate || txDate > toDate) continue;

            const dateStr = txDate.toISOString().split('T')[0];
            const existing = contractMap.get(toAddr) ?? {
                dates: new Set<string>(),
                txCount: 0,
            };
            existing.dates.add(dateStr);
            existing.txCount++;
            contractMap.set(toAddr, existing);
        }

        for (const [addr, data] of contractMap) {
            const contract = contractSet.get(addr)!;
            activities.push({
                chainId: contract.chainId,
                contractAddress: addr,
                actionType: contract.actionType,
                activeDates: Array.from(data.dates),
                txCount: data.txCount,
            });
        }
    } catch (err) {
        console.error(
            `[PassportScanner] EVM scan failed for ${walletAddress}:`,
            err,
        );
    }

    return activities;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring Engine
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_DEPTH_WEIGHTS: Record<string, number> = {
    GOVERNANCE: 100,
    LP: 85,
    STAKE: 75,
    SWAP: 50,
    BRIDGE: 45,
    MINT: 40,
    OTHER: 20,
};

/**
 * Compute passport score from scan results.
 *
 * All sub-scores normalised to 0–100. Composite is a weighted average.
 */
function computeScore(
    scanResults: ScanResult[],
    previousConsecutiveWeeks: number,
): ScoreBreakdown {
    const allActiveDates = new Set<string>();
    const protocolAddresses = new Set<string>();
    const actionTypes = new Set<string>();
    let totalTxCount = 0;
    let maxDepthWeight = 0;

    for (const result of scanResults) {
        for (const activity of result.activities) {
            for (const date of activity.activeDates) {
                allActiveDates.add(date);
            }
            protocolAddresses.add(activity.contractAddress.toLowerCase());
            actionTypes.add(activity.actionType);
            totalTxCount += activity.txCount;
            maxDepthWeight = Math.max(
                maxDepthWeight,
                ACTION_DEPTH_WEIGHTS[activity.actionType] ??
                    ACTION_DEPTH_WEIGHTS.OTHER,
            );
        }
    }

    const activeDays = allActiveDates.size;
    const hasActivity = activeDays > 0;

    // ── Frequency (0–100): distinct active days in 30-day window ──
    // 15+ days in 30 = perfect score
    const frequencyScore = Math.min(100, Math.round((activeDays / 15) * 100));

    // ── Recency (0–100): how recent is the latest activity? ──
    let recencyScore = 0;
    if (hasActivity) {
        const dates = Array.from(allActiveDates)
            .map((d) => new Date(d))
            .sort((a, b) => b.getTime() - a.getTime());
        const daysSinceLast = Math.floor(
            (Date.now() - dates[0].getTime()) / (1000 * 60 * 60 * 24),
        );
        // Within 3 days = 100, decays linearly to 0 at 30 days
        recencyScore = Math.max(
            0,
            Math.round(100 - (daysSinceLast / 30) * 100),
        );
    }

    // ── Depth (0–100): highest-value action type observed ──
    const depthScore = hasActivity ? maxDepthWeight : 0;

    // ── Variety (0–100): number of distinct partner protocols ──
    // 4+ protocols = perfect score
    const varietyScore = Math.min(
        100,
        Math.round((protocolAddresses.size / 4) * 100),
    );

    // ── Volume tier (0–4): rough tx count brackets ──
    let volumeTier = 0;
    if (totalTxCount >= 100) volumeTier = 4;
    else if (totalTxCount >= 50) volumeTier = 3;
    else if (totalTxCount >= 20) volumeTier = 2;
    else if (totalTxCount >= 5) volumeTier = 1;

    // ── Consecutive active weeks ──
    const consecutiveActiveWeeks = hasActivity
        ? previousConsecutiveWeeks + 1
        : 0;

    // ── Composite: weighted average ──
    const compositeScore = Math.round(
        frequencyScore * 0.3 +
            recencyScore * 0.2 +
            depthScore * 0.25 +
            varietyScore * 0.15 +
            volumeTier * 2.5, // 0–10 points from volume
    );

    return {
        frequencyScore,
        recencyScore,
        depthScore,
        varietyScore,
        volumeTier,
        compositeScore,
        consecutiveActiveWeeks,
        crossProtocolCount: protocolAddresses.size,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

interface ScanBatchResult {
    walletsScanned: number;
    walletsUpdated: number;
    walletsSkipped: number;
    errors: string[];
}

/**
 * Main entry point: scan a batch of wallets and update their passport scores.
 *
 * @param batchSize Max wallets to process in this invocation (default 100).
 *                  Cron calls this repeatedly until all eligible wallets done.
 */
export async function runPassportScan(
    batchSize: number = 100,
): Promise<ScanBatchResult> {
    const result: ScanBatchResult = {
        walletsScanned: 0,
        walletsUpdated: 0,
        walletsSkipped: 0,
        errors: [],
    };

    // 1. Load approved whitelisted contracts
    const whitelist = await prisma.partnerContractWhitelist.findMany({
        where: { isApproved: true },
    });

    if (whitelist.length === 0) {
        result.errors.push('No approved contracts in whitelist');
        return result;
    }

    const contracts: WhitelistedContract[] = whitelist.map((w) => ({
        chainId: w.chainId,
        contractAddress: w.contractAddress,
        actionType: w.actionType,
    }));

    // 2. Find wallets due for scanning.
    //    WEEKLY cadence: last scanned > 5 days ago (±2 day jitter applied)
    //    MONTHLY cadence: last scanned > 28 days ago
    //    Never scanned: always eligible
    const jitterDays = Math.floor(Math.random() * 5) - 2; // -2 to +2
    const weeklyThreshold = new Date();
    weeklyThreshold.setDate(weeklyThreshold.getDate() - (7 + jitterDays));

    const monthlyThreshold = new Date();
    monthlyThreshold.setDate(monthlyThreshold.getDate() - 30);

    // Get users who have completed at least one campaign (passport holders)
    const eligibleUsers = await prisma.$queryRaw<
        Array<{
            id: string;
            walletAddress: string;
            lastScannedAt: Date | null;
            consecutiveActiveWeeks: number;
            scanCadence: string;
        }>
    >`
        SELECT
            u."id",
            u."walletAddress",
            ps."lastScannedAt",
            COALESCE(ps."consecutiveActiveWeeks", 0) as "consecutiveActiveWeeks",
            COALESCE(ps."scanCadence", 'WEEKLY') as "scanCadence"
        FROM "User" u
        INNER JOIN "CampaignParticipant" cp ON cp."userId" = u."id"
        LEFT JOIN "PassportScore" ps ON ps."userId" = u."id"
        WHERE cp."completedAt" IS NOT NULL
        AND (
            ps."lastScannedAt" IS NULL
            OR (ps."scanCadence" = 'WEEKLY'  AND ps."lastScannedAt" < ${weeklyThreshold})
            OR (ps."scanCadence" = 'MONTHLY' AND ps."lastScannedAt" < ${monthlyThreshold})
        )
        GROUP BY u."id", u."walletAddress", ps."lastScannedAt",
                 ps."consecutiveActiveWeeks", ps."scanCadence"
        ORDER BY ps."lastScannedAt" ASC NULLS FIRST
        LIMIT ${batchSize}
    `;

    if (eligibleUsers.length === 0) {
        return result;
    }

    // 3. Scan window: last 30 days (rolling)
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);

    // 4. Scan each wallet
    for (const user of eligibleUsers) {
        result.walletsScanned++;

        try {
            // EVM scan
            const activities = await scanEvmWallet(
                user.walletAddress,
                contracts,
                fromDate,
                toDate,
            );

            const scanResult: ScanResult = {
                userId: user.id,
                walletAddress: user.walletAddress,
                chainId: 8453, // Base
                activities,
                activeDays: new Set(activities.flatMap((a) => a.activeDates))
                    .size,
                totalTxCount: activities.reduce(
                    (sum, a) => sum + a.txCount,
                    0,
                ),
            };

            // 5. Compute score
            const score = computeScore(
                activities.length > 0 ? [scanResult] : [],
                user.consecutiveActiveWeeks,
            );

            // 6. Determine cadence: inactive 90+ days → MONTHLY
            const newCadence =
                score.consecutiveActiveWeeks === 0 &&
                user.consecutiveActiveWeeks >= 13
                    ? 'MONTHLY'
                    : score.consecutiveActiveWeeks > 0
                      ? 'WEEKLY'
                      : (user.scanCadence as 'WEEKLY' | 'MONTHLY');

            // 7. Upsert PassportScore
            await prisma.passportScore.upsert({
                where: { userId: user.id },
                update: {
                    frequencyScore: score.frequencyScore,
                    recencyScore: score.recencyScore,
                    depthScore: score.depthScore,
                    varietyScore: score.varietyScore,
                    volumeTier: score.volumeTier,
                    compositeScore: score.compositeScore,
                    consecutiveActiveWeeks: score.consecutiveActiveWeeks,
                    crossProtocolCount: score.crossProtocolCount,
                    scanCadence: newCadence,
                    lastScannedAt: new Date(),
                },
                create: {
                    userId: user.id,
                    walletAddress: user.walletAddress,
                    frequencyScore: score.frequencyScore,
                    recencyScore: score.recencyScore,
                    depthScore: score.depthScore,
                    varietyScore: score.varietyScore,
                    volumeTier: score.volumeTier,
                    compositeScore: score.compositeScore,
                    consecutiveActiveWeeks: score.consecutiveActiveWeeks,
                    crossProtocolCount: score.crossProtocolCount,
                    scanCadence: newCadence,
                    lastScannedAt: new Date(),
                },
            });

            // 8. Write scan log
            if (activities.length > 0) {
                await prisma.walletScanLog.create({
                    data: {
                        userId: user.id,
                        walletAddress: user.walletAddress,
                        chainId: scanResult.chainId,
                        contractsInteracted: activities.map(
                            (a) => a.contractAddress,
                        ),
                        actionsDetected: activities.map((a) => a.actionType),
                        activeDays: scanResult.activeDays,
                        txCount: scanResult.totalTxCount,
                    },
                });
            }

            result.walletsUpdated++;

            // Evaluate badges after scan update (fire-and-forget)
            evaluateBadges(user.id).catch((err) =>
                console.error(
                    `[PassportScanner] Badge evaluation failed for ${user.id}:`,
                    err,
                ),
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(
                `Failed scanning ${user.walletAddress}: ${msg}`,
            );
        }
    }

    result.walletsSkipped = result.walletsScanned - result.walletsUpdated;
    return result;
}

// Singleton getter (matches project pattern)
let _instance: typeof runPassportScan | null = null;

export function getPassportScanner() {
    if (!_instance) _instance = runPassportScan;
    return _instance;
}
