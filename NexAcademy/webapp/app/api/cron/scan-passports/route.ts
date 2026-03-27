import { NextRequest, NextResponse } from 'next/server';
import { runPassportScan } from '@/lib/services/passport-scanner.service';

/**
 * POST /api/cron/scan-passports
 *
 * Scheduled job (run daily) that scans registered wallets for on-chain
 * activity against partner protocol contracts (the "Living Passport").
 *
 * Each invocation processes up to `batchSize` wallets. The cron runner
 * should call repeatedly until `walletsScanned === 0` to drain the queue.
 *
 * Wallets on WEEKLY cadence are scanned every ~7 days (±2 day jitter).
 * Wallets on MONTHLY cadence (inactive 90+ days) are scanned every ~30 days.
 *
 * Protected by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
    // Auth: same pattern as sync-points
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.ALCHEMY_RPC_URL) {
        return NextResponse.json(
            { error: 'ALCHEMY_RPC_URL is not configured' },
            { status: 503 },
        );
    }

    try {
        // Parse optional batch size from query params (default 100)
        const url = new URL(request.url);
        const batchSize = Math.min(
            500,
            parseInt(url.searchParams.get('batchSize') ?? '100', 10) || 100,
        );

        const result = await runPassportScan(batchSize);

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('[Cron] scan-passports error:', error);
        return NextResponse.json(
            { error: 'Failed to run passport scan' },
            { status: 500 },
        );
    }
}
