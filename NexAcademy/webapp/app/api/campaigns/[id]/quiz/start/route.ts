import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import { startQuiz, QuizError } from '@/lib/services/quiz-engine.service';

/**
 * POST /api/campaigns/[id]/quiz/start
 *
 * Draw random questions from the campaign's pool and create a quiz attempt.
 * Returns questions WITHOUT correct answers (server-side grading only).
 *
 * Body (optional): { drawCount?: number }  (default 6, min 5, max 8)
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    // Verify user is enrolled in this campaign
    const participant = await prisma.campaignParticipant.findUnique({
        where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
    });

    if (!participant) {
        return NextResponse.json({ error: 'Not enrolled in this campaign' }, { status: 403 });
    }

    // Parse optional draw count (clamped 5-8)
    let drawCount = 6;
    try {
        const body = await request.json().catch(() => ({}));
        if (body.drawCount) {
            drawCount = Math.max(5, Math.min(8, Number(body.drawCount) || 6));
        }
    } catch {
        // Use default
    }

    try {
        const result = await startQuiz(
            auth.user.userId,
            campaignId,
            participant.id,
            drawCount,
        );

        // Strip shuffled order from response (client doesn't need to know the mapping)
        const sanitizedQuestions = result.questions.map((q) => ({
            id: q.id,
            type: q.type,
            questionText: q.questionText,
            options: q.options,
            points: q.points,
            difficulty: q.difficulty,
            isFollowUp: q.isFollowUp,
        }));

        return NextResponse.json({
            attemptId: result.attemptId,
            questions: sanitizedQuestions,
            timeLimitSeconds: result.timeLimitSeconds,
        });
    } catch (err) {
        if (err instanceof QuizError) {
            const status = err.code === 'ALREADY_ATTEMPTED' ? 409 : 400;
            return NextResponse.json({ error: err.message, code: err.code }, { status });
        }
        console.error('Quiz start error:', err);
        return NextResponse.json({ error: 'Failed to start quiz' }, { status: 500 });
    }
}
