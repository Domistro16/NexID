import { NextRequest, NextResponse } from 'next/server';
import { KillSwitchScope } from '@prisma/client';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import {
    activateKillSwitch,
    deactivateKillSwitch,
    listActiveKillSwitches,
} from '@/lib/services/kill-switch.service';

const VALID_SCOPES = new Set<string>(['GLOBAL', 'CAMPAIGN', 'USER']);

/**
 * GET /api/admin/kill-switches
 * List all active kill switches.
 */
export async function GET(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const switches = await listActiveKillSwitches();
    return NextResponse.json({ switches });
}

/**
 * POST /api/admin/kill-switches
 * Activate a kill switch.
 *
 * Body: { scope, feature, targetId?, reason?, expiresAt? }
 */
export async function POST(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized || !admin.user) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const { scope, feature, targetId, reason, expiresAt } = body;

    if (!scope || !VALID_SCOPES.has(scope)) {
        return NextResponse.json(
            { error: 'Invalid scope. Must be GLOBAL, CAMPAIGN, or USER' },
            { status: 400 },
        );
    }
    if (!feature || typeof feature !== 'string') {
        return NextResponse.json({ error: 'Feature name is required' }, { status: 400 });
    }

    await activateKillSwitch({
        scope: scope as KillSwitchScope,
        feature,
        targetId: targetId ?? undefined,
        reason,
        activatedBy: admin.user.userId,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    return NextResponse.json({ success: true });
}

/**
 * DELETE /api/admin/kill-switches
 * Deactivate a kill switch.
 *
 * Body: { scope, feature, targetId? }
 */
export async function DELETE(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const { scope, feature, targetId } = body;

    if (!scope || !VALID_SCOPES.has(scope) || !feature) {
        return NextResponse.json({ error: 'scope and feature are required' }, { status: 400 });
    }

    await deactivateKillSwitch(
        scope as KillSwitchScope,
        feature,
        targetId ?? undefined,
    );

    return NextResponse.json({ success: true });
}
