import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import { getUserMultiplierWithContext } from '@/lib/services/multiplier.service';

/**
 * GET /api/user/multiplier
 *
 * Returns the authenticated user's behaviour-based multiplier breakdown
 * with human-readable signal descriptions for dashboard display.
 */
export async function GET(request: NextRequest) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const data = await getUserMultiplierWithContext(auth.user.userId);

    return NextResponse.json(data);
}
