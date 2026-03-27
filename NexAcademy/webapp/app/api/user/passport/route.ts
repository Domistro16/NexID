import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';

/**
 * GET /api/user/passport
 *
 * Returns the authenticated user's Living Passport score breakdown,
 * scan history, and badge-qualifying metrics.
 */
export async function GET(request: NextRequest) {
    const auth = verifyAuth(request);
    if (!auth) return unauthorizedResponse();

    const [passportScore, recentScans] = await Promise.all([
        prisma.passportScore.findUnique({
            where: { userId: auth.userId },
        }),
        prisma.walletScanLog.findMany({
            where: { userId: auth.userId },
            orderBy: { scanDate: 'desc' },
            take: 10,
        }),
    ]);

    if (!passportScore) {
        return NextResponse.json({
            hasPassport: false,
            score: null,
            recentScans: [],
        });
    }

    return NextResponse.json({
        hasPassport: true,
        score: {
            compositeScore: passportScore.compositeScore,
            frequencyScore: passportScore.frequencyScore,
            recencyScore: passportScore.recencyScore,
            depthScore: passportScore.depthScore,
            varietyScore: passportScore.varietyScore,
            volumeTier: passportScore.volumeTier,
            consecutiveActiveWeeks: passportScore.consecutiveActiveWeeks,
            crossProtocolCount: passportScore.crossProtocolCount,
            lastScannedAt: passportScore.lastScannedAt,
            scanCadence: passportScore.scanCadence,
        },
        recentScans: recentScans.map((scan) => ({
            scanDate: scan.scanDate,
            chainId: scan.chainId,
            contractsInteracted: scan.contractsInteracted,
            actionsDetected: scan.actionsDetected,
            activeDays: scan.activeDays,
            txCount: scan.txCount,
        })),
    });
}
