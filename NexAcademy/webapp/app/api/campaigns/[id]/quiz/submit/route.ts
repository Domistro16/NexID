import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import {
    gradeMcqAnswers,
    storeAnswers,
    finalizeAttempt,
    QuizError,
    type AnswerSubmission,
} from '@/lib/services/quiz-engine.service';
import { gradeAttemptFreeText } from '@/lib/services/quiz-grading.service';
import { detectAndEnforce } from '@/lib/services/ai-detection.service';
import { calculateCompositeScore } from '@/lib/services/scoring-composition.service';

/**
 * POST /api/campaigns/[id]/quiz/submit
 *
 * Submit all quiz answers for grading.
 * MCQ answers are graded instantly server-side.
 * Free-text answers are graded via AI semantic analysis.
 * AI-generated content detection runs on all free-text answers.
 *
 * Body: {
 *   attemptId: string;
 *   answers: Array<{
 *     questionId: string;
 *     selectedIndex?: number;    // MCQ
 *     freeTextAnswer?: string;   // FREE_TEXT
 *     shownAt: string;           // ISO timestamp
 *     answeredAt: string;        // ISO timestamp
 *   }>;
 *   shuffledOrders: Record<string, number[]>;  // questionId → shuffled order
 * }
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

    let body: {
        attemptId: string;
        answers: AnswerSubmission[];
        shuffledOrders: Record<string, number[]>;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body.attemptId || !Array.isArray(body.answers) || body.answers.length === 0) {
        return NextResponse.json({ error: 'Missing attemptId or answers' }, { status: 400 });
    }

    // Verify the attempt belongs to this user and campaign
    const attempt = await prisma.quizAttempt.findUnique({
        where: { id: body.attemptId },
        include: {
            campaign: { select: { title: true, sponsorName: true, objective: true, contractType: true } },
        },
    });

    if (!attempt) {
        return NextResponse.json({ error: 'Quiz attempt not found' }, { status: 404 });
    }
    if (attempt.userId !== auth.user.userId || attempt.campaignId !== campaignId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (attempt.completedAt) {
        return NextResponse.json({ error: 'Quiz already submitted' }, { status: 409 });
    }

    try {
        // Step 1: Grade MCQ answers server-side
        const { mcqResults } = await gradeMcqAnswers(body.attemptId, body.answers);

        // Step 2: Store all answers
        const shuffledMap = new Map(Object.entries(body.shuffledOrders || {}));
        await storeAnswers(body.attemptId, body.answers, mcqResults, shuffledMap);

        // Step 3: Run AI detection on free-text answers
        let aiContentDetected = false;
        const freeTextAnswers = body.answers.filter((a) => a.freeTextAnswer);
        const questions = await prisma.question.findMany({
            where: { id: { in: freeTextAnswers.map((a) => a.questionId) } },
        });
        const questionMap = new Map(questions.map((q) => [q.id, q]));

        for (const ans of freeTextAnswers) {
            if (!ans.freeTextAnswer) continue;
            const question = questionMap.get(ans.questionId);
            if (!question) continue;

            const detection = await detectAndEnforce(
                ans.freeTextAnswer,
                auth.user.userId,
                campaignId,
                {
                    questionText: question.questionText,
                    campaignTitle: attempt.campaign.title,
                    fieldName: `quiz_answer_${ans.questionId}`,
                },
            );

            if (detection.shouldFlag) {
                aiContentDetected = true;
                // Update the stored answer with detection results
                await prisma.quizAttemptAnswer.updateMany({
                    where: { attemptId: body.attemptId, questionId: ans.questionId },
                    data: {
                        aiContentFlag: detection.shouldShadowBan,
                        aiDetectionConfidence: detection.confidence,
                    },
                });
            }
        }

        // Step 4: Grade free-text answers via AI semantic grading
        const { gradedCount } = await gradeAttemptFreeText(body.attemptId);

        // Step 5: Calculate total score
        const allAnswers = await prisma.quizAttemptAnswer.findMany({
            where: { attemptId: body.attemptId },
            include: { question: { select: { points: true, type: true } } },
        });

        let totalPoints = 0;
        let maxPoints = 0;
        let correctCount = 0;
        let timeLimitExceeded = false;
        const weightedScoring = attempt.campaign.contractType === 'PARTNER_CAMPAIGNS';

        for (const ans of allAnswers) {
            const effectivePoints = weightedScoring ? ans.question.points : 1;
            maxPoints += effectivePoints;
            if (ans.isCorrect) {
                totalPoints += effectivePoints;
                correctCount++;
            }
            if (ans.timeTakenSeconds && ans.timeTakenSeconds > 60) {
                timeLimitExceeded = true;
            }
        }

        // Normalize to 0-100
        const totalScore = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

        // Step 6: Finalize the attempt
        await finalizeAttempt(
            body.attemptId,
            totalScore,
            correctCount,
            timeLimitExceeded,
            aiContentDetected,
        );

        // Step 7: Update CampaignParticipant.quizScore and composite score
        const participant = await prisma.campaignParticipant.update({
            where: {
                campaignId_userId: { campaignId, userId: auth.user.userId },
            },
            data: { quizScore: totalScore },
            select: {
                videoScore: true,
                quizScore: true,
                onchainScore: true,
                agentScore: true,
            },
        });

        const composite = calculateCompositeScore({
            videoScore: participant.videoScore ?? 0,
            quizScore: totalScore,
            onchainScore: participant.onchainScore ?? 0,
            agentScore: participant.agentScore ?? 0,
        });

        await prisma.campaignParticipant.update({
            where: {
                campaignId_userId: { campaignId, userId: auth.user.userId },
            },
            data: { compositeScore: composite.compositeScore },
        });

        return NextResponse.json({
            totalScore,
            correctCount,
            totalQuestions: allAnswers.length,
            freeTextGraded: gradedCount,
            timeLimitExceeded,
            aiContentDetected,
            // Per-question results (without revealing correct answers for MCQ)
            results: allAnswers.map((a) => ({
                questionId: a.questionId,
                isCorrect: a.isCorrect,
                aiGradingScore: a.aiGradingScore,
                timeTakenSeconds: a.timeTakenSeconds,
            })),
        });
    } catch (err) {
        if (err instanceof QuizError) {
            return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
        }
        console.error('Quiz submit error:', err);
        return NextResponse.json({ error: 'Failed to submit quiz' }, { status: 500 });
    }
}
