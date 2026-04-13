import { NextRequest, NextResponse } from 'next/server';
import { QuestionType } from '@prisma/client';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import { startQuiz, QuizError } from '@/lib/services/quiz-engine.service';
import { hasStructuredFreeTextGradingProvider } from '@/lib/services/quiz-grading.service';
import { resolveCampaignId } from '@/lib/campaign-route';

/**
 * POST /api/campaigns/[id]/quiz/start
 *
 * Draw random questions from the campaign's pool and create a quiz attempt.
 * Returns questions WITHOUT correct answers (server-side grading only).
 *
 * Body (optional): { drawCount?: number, mode?: "MCQ" | "FREE_TEXT" }  (default 6, min 5, max 8)
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
    const campaignId = await resolveCampaignId(id);
    if (campaignId === null) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
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
    let mode: QuestionType | undefined;
    try {
        const body = await request.json().catch(() => ({}));
        if (body.drawCount) {
            drawCount = Math.max(5, Math.min(8, Number(body.drawCount) || 6));
        }
        if (body.mode === 'MCQ' || body.mode === 'FREE_TEXT') {
            mode = body.mode;
        }
    } catch {
        // Use default
    }

    if (mode === 'FREE_TEXT' && !hasStructuredFreeTextGradingProvider()) {
        return NextResponse.json(
            { error: 'Free-text structured quiz is unavailable because no OPENAI_API_KEY or ANTHROPIC_API_KEY is configured' },
            { status: 409 },
        );
    }

    try {
        const result = await startQuiz(
            auth.user.userId,
            campaignId,
            participant.id,
            drawCount,
            mode,
        );

        // Return the server-generated shuffle mapping so the client can render
        // the exact option order we generated while still grading against the
        // original correctIndex server-side.
        const sanitizedQuestions = result.questions.map((q) => ({
            id: q.id,
            type: q.type,
            questionText: q.questionText,
            options: q.options,
            shuffledOrder: q.shuffledOrder,
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
