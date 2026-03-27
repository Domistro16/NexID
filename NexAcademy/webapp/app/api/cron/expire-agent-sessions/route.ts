import { NextRequest, NextResponse } from 'next/server';
import { expireStaleSessions } from '@/lib/services/agent-session.service';

/**
 * POST /api/cron/expire-agent-sessions
 *
 * Cron job (run every minute) that expires stale agent sessions:
 * - Wallet challenges older than 30 seconds
 * - Active sessions past their max duration + 60s grace
 *
 * Promotes queued sessions when slots open.
 * Protected by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const expired = await expireStaleSessions();
        return NextResponse.json({ success: true, expiredCount: expired });
    } catch (error) {
        console.error('[Cron] expire-agent-sessions error:', error);
        return NextResponse.json(
            { error: 'Failed to expire sessions' },
            { status: 500 },
        );
    }
}
