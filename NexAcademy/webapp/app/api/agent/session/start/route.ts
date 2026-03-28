import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import { startSession } from '@/lib/services/agent-session.service';

/**
 * POST /api/agent/session/start
 * Start an agent session after wallet signature verification.
 *
 * Body: { sessionToken, walletSignature }
 *
 * Strategy: "Session start requires a fresh wallet signature within 30 seconds
 * — proves live control of the wallet at session start."
 */
export async function POST(request: NextRequest) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { sessionToken, walletSignature } = body;

    if (!sessionToken || !walletSignature) {
        return NextResponse.json(
            { error: 'sessionToken and walletSignature are required' },
            { status: 400 },
        );
    }

    try {
        const result = await startSession(sessionToken, walletSignature);
        return NextResponse.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start session';
        // 409 for token replay / already-used nonce
        const status = message.includes('already used') ? 409 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}
