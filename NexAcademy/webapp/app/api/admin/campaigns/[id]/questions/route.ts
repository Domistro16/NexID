import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';

/**
 * GET /api/admin/campaigns/[id]/questions
 * List all questions in a campaign's pool.
 *
 * Query params: ?type=MCQ|FREE_TEXT&active=true|false
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const active = url.searchParams.get('active');

    const where: Prisma.QuestionWhereInput = { campaignId };
    if (type === 'MCQ' || type === 'FREE_TEXT') where.type = type;
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;

    const questions = await prisma.question.findMany({
        where,
        orderBy: [{ type: 'asc' }, { difficulty: 'asc' }, { createdAt: 'desc' }],
    });

    const stats = {
        total: questions.length,
        active: questions.filter((q) => q.isActive).length,
        mcq: questions.filter((q) => q.type === 'MCQ').length,
        freeText: questions.filter((q) => q.type === 'FREE_TEXT').length,
        speedTraps: questions.filter((q) => q.isSpeedTrap).length,
    };

    return NextResponse.json({ questions, stats });
}

/**
 * POST /api/admin/campaigns/[id]/questions
 * Add one or more questions to the campaign's pool.
 *
 * Body: single question or array of questions:
 * {
 *   type: "MCQ" | "FREE_TEXT";
 *   questionText: string;
 *   variants?: string[];
 *   options?: string[];       // Required for MCQ
 *   correctIndex?: number;    // Required for MCQ
 *   gradingRubric?: string;   // Recommended for FREE_TEXT
 *   points?: number;
 *   difficulty?: number;      // 1-3
 *   tags?: string[];
 *   isSpeedTrap?: boolean;
 *   speedTrapWindow?: number;
 * }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true },
    });
    if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const body = await request.json();
    const items = Array.isArray(body) ? body : [body];

    const errors: string[] = [];
    const created: string[] = [];

    for (let i = 0; i < items.length; i++) {
        const q = items[i];

        // Validation
        if (!q.type || !['MCQ', 'FREE_TEXT'].includes(q.type)) {
            errors.push(`Item ${i}: type must be MCQ or FREE_TEXT`);
            continue;
        }
        if (!q.questionText || typeof q.questionText !== 'string') {
            errors.push(`Item ${i}: questionText is required`);
            continue;
        }
        if (q.type === 'MCQ') {
            if (!Array.isArray(q.options) || q.options.length < 2) {
                errors.push(`Item ${i}: MCQ requires at least 2 options`);
                continue;
            }
            if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
                errors.push(`Item ${i}: MCQ requires valid correctIndex`);
                continue;
            }
        }

        const question = await prisma.question.create({
            data: {
                campaignId,
                type: q.type,
                questionText: q.questionText,
                variants: (q.variants || []) as Prisma.InputJsonValue,
                options: q.type === 'MCQ' ? (q.options as Prisma.InputJsonValue) : Prisma.JsonNull,
                correctIndex: q.type === 'MCQ' ? q.correctIndex : null,
                gradingRubric: q.gradingRubric || null,
                points: q.points || 10,
                difficulty: Math.max(1, Math.min(3, q.difficulty || 2)),
                tags: q.tags || [],
                isSpeedTrap: q.isSpeedTrap || false,
                speedTrapWindow: q.speedTrapWindow || null,
            },
        });

        created.push(question.id);
    }

    return NextResponse.json({
        created: created.length,
        errors: errors.length > 0 ? errors : undefined,
        questionIds: created,
    }, { status: errors.length > 0 && created.length === 0 ? 400 : 201 });
}

/**
 * PATCH /api/admin/campaigns/[id]/questions
 * Update a question in the pool.
 *
 * Body: { questionId: string; ...fields to update }
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    const body = await request.json();
    if (!body.questionId) {
        return NextResponse.json({ error: 'questionId is required' }, { status: 400 });
    }

    // Verify question belongs to this campaign
    const existing = await prisma.question.findFirst({
        where: { id: body.questionId, campaignId },
    });
    if (!existing) {
        return NextResponse.json({ error: 'Question not found in this campaign' }, { status: 404 });
    }

    const updateData: Prisma.QuestionUpdateInput = {};
    if (body.questionText !== undefined) updateData.questionText = body.questionText;
    if (body.variants !== undefined) updateData.variants = body.variants as Prisma.InputJsonValue;
    if (body.options !== undefined) updateData.options = body.options as Prisma.InputJsonValue;
    if (body.correctIndex !== undefined) updateData.correctIndex = body.correctIndex;
    if (body.gradingRubric !== undefined) updateData.gradingRubric = body.gradingRubric;
    if (body.points !== undefined) updateData.points = body.points;
    if (body.difficulty !== undefined) updateData.difficulty = Math.max(1, Math.min(3, body.difficulty));
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.isSpeedTrap !== undefined) updateData.isSpeedTrap = body.isSpeedTrap;
    if (body.speedTrapWindow !== undefined) updateData.speedTrapWindow = body.speedTrapWindow;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const updated = await prisma.question.update({
        where: { id: body.questionId },
        data: updateData,
    });

    return NextResponse.json({ updated });
}

/**
 * DELETE /api/admin/campaigns/[id]/questions
 * Deactivate a question (soft delete — sets isActive=false).
 *
 * Body: { questionId: string }
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    const body = await request.json();
    if (!body.questionId) {
        return NextResponse.json({ error: 'questionId is required' }, { status: 400 });
    }

    await prisma.question.updateMany({
        where: { id: body.questionId, campaignId },
        data: { isActive: false },
    });

    return NextResponse.json({ deactivated: true });
}
