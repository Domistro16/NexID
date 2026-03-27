import { NextRequest, NextResponse } from 'next/server';
import { AgentSessionType } from '@prisma/client';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';

/**
 * GET /api/admin/agent-slots
 * List all agent slot configurations.
 */
export async function GET(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const configs = await prisma.agentSlotConfig.findMany({
        orderBy: { sessionType: 'asc' },
    });

    return NextResponse.json({ configs });
}

/**
 * PUT /api/admin/agent-slots
 * Update slot configuration for a session type.
 *
 * Body: { sessionType, maxConcurrent?, maxDurationSeconds?, enabled?, topNEligible? }
 */
export async function PUT(request: NextRequest) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const { sessionType, maxConcurrent, maxDurationSeconds, enabled, topNEligible } = body;

    if (!sessionType) {
        return NextResponse.json({ error: 'sessionType is required' }, { status: 400 });
    }

    // Validate maxConcurrent bounds (strategy: 10–25 range)
    if (maxConcurrent !== undefined) {
        const mc = Number(maxConcurrent);
        if (!Number.isFinite(mc) || mc < 10 || mc > 25) {
            return NextResponse.json(
                { error: 'maxConcurrent must be between 10 and 25' },
                { status: 400 },
            );
        }
    }

    const data: Record<string, unknown> = {};
    if (maxConcurrent !== undefined) data.maxConcurrent = Number(maxConcurrent);
    if (maxDurationSeconds !== undefined) data.maxDurationSeconds = maxDurationSeconds;
    if (enabled !== undefined) data.enabled = enabled;
    if (topNEligible !== undefined) data.topNEligible = topNEligible;

    const config = await prisma.agentSlotConfig.upsert({
        where: { sessionType: sessionType as AgentSessionType },
        update: data,
        create: {
            sessionType: sessionType as AgentSessionType,
            maxConcurrent: maxConcurrent ?? 25,
            maxDurationSeconds: maxDurationSeconds ?? 300,
            enabled: enabled ?? true,
            topNEligible: topNEligible ?? 0,
        },
    });

    return NextResponse.json({ config });
}
