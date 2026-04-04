import { SybilFlagReason, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum wallet age in days to participate in campaigns */
const MIN_WALLET_AGE_DAYS = 90;

/** Minimum number of on-chain transactions to pass depth check */
const MIN_ON_CHAIN_TX_COUNT = 3;

/** Maximum users sharing the same IP hash before flagging */
const IP_CLUSTER_THRESHOLD = 5;

/** Maximum users sharing the same device fingerprint before flagging */
const DEVICE_CLUSTER_THRESHOLD = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Hashing helpers — we store hashes, never raw IPs or fingerprints
// ─────────────────────────────────────────────────────────────────────────────

const HASH_SALT: string = (() => {
    const salt = process.env.SYBIL_HASH_SALT;
    if (!salt) throw new Error('SYBIL_HASH_SALT must be configured');
    return salt;
})();

export function hashValue(value: string): string {
    return crypto
        .createHmac('sha256', HASH_SALT)
        .update(value.toLowerCase().trim())
        .digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Fingerprint recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a session fingerprint for correlation analysis.
 * Called on campaign enrollment or any protected action.
 */
export async function recordFingerprint(
    userId: string,
    ip: string,
    deviceFingerprint?: string,
    userAgent?: string,
): Promise<void> {
    const ipHash = hashValue(ip);
    const deviceHash = deviceFingerprint ? hashValue(deviceFingerprint) : null;
    const userAgentHash = userAgent ? hashValue(userAgent) : null;

    await prisma.sessionFingerprint.create({
        data: {
            userId,
            ipHash,
            deviceHash,
            userAgentHash,
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sybil checks
// ─────────────────────────────────────────────────────────────────────────────

export interface SybilCheckResult {
    passed: boolean;
    flags: Array<{ reason: SybilFlagReason; evidence: Record<string, unknown> }>;
}

/**
 * Check wallet age via Alchemy `eth_getTransactionCount` and first-tx lookup.
 * Returns false if the wallet is younger than MIN_WALLET_AGE_DAYS.
 */
export async function checkWalletAge(walletAddress: string): Promise<{
    passed: boolean;
    walletAgeDays: number | null;
}> {
    const rpcUrl = process.env.ALCHEMY_RPC_URL;
    if (!rpcUrl) {
        // If no RPC configured, skip the check (don't block users)
        return { passed: true, walletAgeDays: null };
    }

    try {
        // Use Alchemy's asset transfers to find earliest tx
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'alchemy_getAssetTransfers',
                params: [
                    {
                        fromAddress: walletAddress,
                        category: ['external', 'erc20'],
                        order: 'asc',
                        maxCount: '0x1',
                    },
                ],
            }),
        });

        const data = await response.json();
        const transfers = data?.result?.transfers;

        if (!transfers || transfers.length === 0) {
            // No outgoing transactions — wallet has no history
            return { passed: false, walletAgeDays: 0 };
        }

        const firstTxDate = new Date(transfers[0].metadata?.blockTimestamp);
        if (isNaN(firstTxDate.getTime())) {
            return { passed: true, walletAgeDays: null };
        }

        const ageDays = Math.floor(
            (Date.now() - firstTxDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        return {
            passed: ageDays >= MIN_WALLET_AGE_DAYS,
            walletAgeDays: ageDays,
        };
    } catch (err) {
        console.error('[SybilDetection] Wallet age check failed:', err);
        // Fail open — don't block users on RPC errors
        return { passed: true, walletAgeDays: null };
    }
}

/**
 * Check if the user's IP hash appears across too many distinct users.
 */
async function checkIpCluster(
    userId: string,
    ipHash: string,
): Promise<{ passed: boolean; clusterSize: number }> {
    const distinctUsers = await prisma.sessionFingerprint.groupBy({
        by: ['userId'],
        where: {
            ipHash,
            userId: { not: userId },
        },
    });

    const clusterSize = distinctUsers.length + 1; // include self
    return {
        passed: clusterSize < IP_CLUSTER_THRESHOLD,
        clusterSize,
    };
}

/**
 * Check if the user's device fingerprint appears across too many distinct users.
 */
async function checkDeviceCluster(
    userId: string,
    deviceHash: string,
): Promise<{ passed: boolean; clusterSize: number }> {
    const distinctUsers = await prisma.sessionFingerprint.groupBy({
        by: ['userId'],
        where: {
            deviceHash,
            userId: { not: userId },
        },
    });

    const clusterSize = distinctUsers.length + 1;
    return {
        passed: clusterSize < DEVICE_CLUSTER_THRESHOLD,
        clusterSize,
    };
}

/**
 * Check on-chain depth — does the user have enough real transaction history
 * across whitelisted contracts?
 */
async function checkOnChainDepth(userId: string): Promise<{
    passed: boolean;
    totalTxCount: number;
}> {
    const result = await prisma.walletScanLog.aggregate({
        where: { userId },
        _sum: { txCount: true },
    });

    const totalTxCount = result._sum.txCount ?? 0;
    return {
        passed: totalTxCount >= MIN_ON_CHAIN_TX_COUNT,
        totalTxCount,
    };
}

/**
 * Cross-wallet correlation — detect wallets whose on-chain activity clusters
 * within narrow time windows, suggesting coordinated Sybil behaviour.
 *
 * Checks whether the target wallet shares transaction-timing patterns with
 * other wallets that are also enrolled in NexID campaigns. Two wallets are
 * "correlated" if they executed outgoing ERC-20 or native transfers within
 * the same 60-second windows on at least CORRELATION_MIN_MATCHES occasions.
 */
const CORRELATION_WINDOW_S = 60;
const CORRELATION_MIN_MATCHES = 3;

async function checkCrossWalletCorrelation(
    userId: string,
    walletAddress: string,
): Promise<{ passed: boolean; correlatedWallets: string[] }> {
    const rpcUrl = process.env.ALCHEMY_RPC_URL;
    if (!rpcUrl) {
        return { passed: true, correlatedWallets: [] };
    }

    try {
        // Fetch target wallet's recent outgoing transfers
        const targetTxRes = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'alchemy_getAssetTransfers',
                params: [{
                    fromAddress: walletAddress,
                    category: ['external', 'erc20'],
                    order: 'desc',
                    maxCount: '0x14', // last 20 txs
                }],
            }),
        });
        const targetData = await targetTxRes.json();
        const targetTransfers = targetData?.result?.transfers;
        if (!targetTransfers || targetTransfers.length < 2) {
            return { passed: true, correlatedWallets: [] };
        }

        // Extract timestamps
        const targetTimes: number[] = targetTransfers
            .map((t: { metadata?: { blockTimestamp?: string } }) => {
                const ts = t.metadata?.blockTimestamp;
                return ts ? Math.floor(new Date(ts).getTime() / 1000) : null;
            })
            .filter((t: number | null): t is number => t !== null);

        if (targetTimes.length < 2) {
            return { passed: true, correlatedWallets: [] };
        }

        // Get other enrolled wallets to compare against
        const others = await prisma.$queryRaw<Array<{ walletAddress: string; userId: string }>>`
            SELECT DISTINCT u."walletAddress", u."id" AS "userId"
            FROM "User" u
            INNER JOIN "CampaignParticipant" cp ON cp."userId" = u."id"
            WHERE u."id" != ${userId}
              AND u."walletAddress" IS NOT NULL
            LIMIT 50
        `;

        const correlatedWallets: string[] = [];

        for (const other of others) {
            try {
                const otherTxRes = await fetch(rpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'alchemy_getAssetTransfers',
                        params: [{
                            fromAddress: other.walletAddress,
                            category: ['external', 'erc20'],
                            order: 'desc',
                            maxCount: '0x14',
                        }],
                    }),
                });
                const otherData = await otherTxRes.json();
                const otherTransfers = otherData?.result?.transfers;
                if (!otherTransfers || otherTransfers.length < 2) continue;

                const otherTimes: number[] = otherTransfers
                    .map((t: { metadata?: { blockTimestamp?: string } }) => {
                        const ts = t.metadata?.blockTimestamp;
                        return ts ? Math.floor(new Date(ts).getTime() / 1000) : null;
                    })
                    .filter((t: number | null): t is number => t !== null);

                // Count timing matches within CORRELATION_WINDOW_S
                let matches = 0;
                for (const tt of targetTimes) {
                    for (const ot of otherTimes) {
                        if (Math.abs(tt - ot) <= CORRELATION_WINDOW_S) {
                            matches++;
                            break; // only count one match per target tx
                        }
                    }
                }

                if (matches >= CORRELATION_MIN_MATCHES) {
                    correlatedWallets.push(other.walletAddress);
                }
            } catch {
                // Skip individual wallet fetch failures
                continue;
            }
        }

        return {
            passed: correlatedWallets.length === 0,
            correlatedWallets,
        };
    } catch (err) {
        console.error('[SybilDetection] Cross-wallet correlation check failed:', err);
        return { passed: true, correlatedWallets: [] };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full sybil detection suite for a user.
 * Creates SybilFlag records for any failing checks.
 * Returns the overall result.
 */
export async function runSybilChecks(
    userId: string,
    walletAddress: string,
    ip?: string,
    deviceFingerprint?: string,
): Promise<SybilCheckResult> {
    const flags: SybilCheckResult['flags'] = [];

    // 1. Wallet age check
    const ageCheck = await checkWalletAge(walletAddress);
    if (!ageCheck.passed) {
        flags.push({
            reason: 'WALLET_AGE_BELOW_MINIMUM' as SybilFlagReason,
            evidence: {
                walletAgeDays: ageCheck.walletAgeDays,
                minimumRequired: MIN_WALLET_AGE_DAYS,
            },
        });
    }

    // 2. IP cluster check
    if (ip) {
        const ipHash = hashValue(ip);
        const ipCheck = await checkIpCluster(userId, ipHash);
        if (!ipCheck.passed) {
            flags.push({
                reason: 'IP_CLUSTER' as SybilFlagReason,
                evidence: {
                    clusterSize: ipCheck.clusterSize,
                    threshold: IP_CLUSTER_THRESHOLD,
                },
            });
        }
    }

    // 3. Device fingerprint cluster check
    if (deviceFingerprint) {
        const deviceHash = hashValue(deviceFingerprint);
        const deviceCheck = await checkDeviceCluster(userId, deviceHash);
        if (!deviceCheck.passed) {
            flags.push({
                reason: 'DEVICE_FINGERPRINT_CLUSTER' as SybilFlagReason,
                evidence: {
                    clusterSize: deviceCheck.clusterSize,
                    threshold: DEVICE_CLUSTER_THRESHOLD,
                },
            });
        }
    }

    // 4. On-chain depth check
    const depthCheck = await checkOnChainDepth(userId);
    if (!depthCheck.passed) {
        flags.push({
            reason: 'SHALLOW_ON_CHAIN_DEPTH' as SybilFlagReason,
            evidence: {
                totalTxCount: depthCheck.totalTxCount,
                minimumRequired: MIN_ON_CHAIN_TX_COUNT,
            },
        });
    }

    // 5. Cross-wallet correlation check (tx timing clusters between wallets)
    const correlationCheck = await checkCrossWalletCorrelation(userId, walletAddress);
    if (!correlationCheck.passed) {
        flags.push({
            reason: 'TX_TIMING_CLUSTER' as SybilFlagReason,
            evidence: {
                correlatedWalletCount: correlationCheck.correlatedWallets.length,
                windowSeconds: CORRELATION_WINDOW_S,
                minMatches: CORRELATION_MIN_MATCHES,
            },
        });
    }

    // Persist any new flags
    if (flags.length > 0) {
        await prisma.sybilFlag.createMany({
            data: flags.map((f) => ({
                userId,
                reason: f.reason,
                evidence: f.evidence as Prisma.InputJsonValue,
                severity: (f.reason === 'WALLET_AGE_BELOW_MINIMUM' || f.reason === 'TX_TIMING_CLUSTER') ? 3 : 2,
            })),
            skipDuplicates: true,
        });
    }

    return {
        passed: flags.length === 0,
        flags,
    };
}

/**
 * Check if a user has any unresolved (non-dismissed) critical sybil flags.
 * Used as a gate before campaign enrollment.
 */
export async function hasBlockingSybilFlags(userId: string): Promise<boolean> {
    const count = await prisma.sybilFlag.count({
        where: {
            userId,
            dismissed: false,
            severity: { gte: 3 },
        },
    });
    return count > 0;
}

/**
 * Get all sybil flags for a user (admin view).
 */
export async function getUserSybilFlags(userId: string) {
    return prisma.sybilFlag.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
    });
}

/**
 * Dismiss a sybil flag (admin action — marks as false positive).
 */
export async function dismissSybilFlag(
    flagId: string,
    reviewedBy: string,
): Promise<void> {
    await prisma.sybilFlag.update({
        where: { id: flagId },
        data: {
            dismissed: true,
            reviewed: true,
            reviewedAt: new Date(),
            reviewedBy,
        },
    });
}
