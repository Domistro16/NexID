import prisma from '@/lib/prisma';

const PASSING_THRESHOLD = 88;
const GRADING_MODEL = 'claude-sonnet-4-5-20250514';

export interface FreeTextGradingResult {
    score: number;
    passed: boolean;
    explanation: string;
    specificFactsFound: string[];
    weaknesses: string[];
}

export interface FollowUpQuestion {
    questionText: string;
    gradingRubric: string;
}

export function hasStructuredFreeTextGradingProvider() {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

export async function gradeFreeText(
    answer: string,
    questionText: string,
    gradingRubric: string | null,
    campaignContext: {
        campaignTitle: string;
        sponsorName: string;
        objective: string;
    },
): Promise<FreeTextGradingResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey || !hasStructuredFreeTextGradingProvider()) {
        throw new Error('Free-text quiz grading is unavailable because no OPENAI_API_KEY or ANTHROPIC_API_KEY is configured');
    }

    const systemPrompt = buildGradingSystemPrompt(campaignContext);
    const userPrompt = buildGradingUserPrompt(questionText, gradingRubric, answer);

    try {
        const result = await callGradingApi(apiKey, systemPrompt, userPrompt);
        return {
            ...result,
            passed: result.score >= PASSING_THRESHOLD,
        };
    } catch (err) {
        console.error('AI grading failed:', err);
        return {
            score: 50,
            passed: false,
            explanation: 'AI grading encountered an error - manual review required',
            specificFactsFound: [],
            weaknesses: ['Grading API error'],
        };
    }
}

export async function generateFollowUp(
    previousAnswer: string,
    previousQuestion: string,
    campaignContext: {
        campaignTitle: string;
        sponsorName: string;
        objective: string;
    },
): Promise<FollowUpQuestion | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey || !hasStructuredFreeTextGradingProvider()) {
        return null;
    }

    const systemPrompt = `You are a technical assessment designer for ${campaignContext.sponsorName}.
Generate ONE follow-up question that:
1. Directly references something specific the user said in their previous answer
2. Asks them to elaborate, clarify, or apply their understanding
3. Cannot be answered without having actually written the previous answer themselves
4. Tests deeper understanding beyond surface-level knowledge

Respond ONLY with valid JSON: {"questionText": "...", "gradingRubric": "..."}`;

    const userPrompt = `Previous question: ${previousQuestion}
User's answer: ${previousAnswer}

Generate a follow-up question.`;

    try {
        const raw = await callRawApi(apiKey, systemPrompt, userPrompt);
        return JSON.parse(raw) as FollowUpQuestion;
    } catch {
        return null;
    }
}

export async function gradeAttemptFreeText(
    attemptId: string,
): Promise<{ gradedCount: number; aiContentDetected: boolean }> {
    const attempt = await prisma.quizAttempt.findUnique({
        where: { id: attemptId },
        include: {
            campaign: {
                select: { title: true, sponsorName: true, objective: true },
            },
            answers: {
                include: { question: true },
            },
        },
    });

    if (!attempt) {
        throw new Error('Quiz attempt not found');
    }

    const campaignContext = {
        campaignTitle: attempt.campaign.title,
        sponsorName: attempt.campaign.sponsorName,
        objective: attempt.campaign.objective,
    };

    let gradedCount = 0;
    let aiContentDetected = false;

    for (const answer of attempt.answers) {
        if (answer.question.type !== 'FREE_TEXT' || !answer.freeTextAnswer) {
            continue;
        }

        const result = await gradeFreeText(
            answer.freeTextAnswer,
            answer.question.questionText,
            answer.question.gradingRubric,
            campaignContext,
        );

        await prisma.quizAttemptAnswer.update({
            where: { id: answer.id },
            data: {
                aiGradingScore: result.score,
                aiGradingNotes: JSON.stringify({
                    explanation: result.explanation,
                    specificFactsFound: result.specificFactsFound,
                    weaknesses: result.weaknesses,
                }),
                isCorrect: result.passed,
            },
        });

        gradedCount++;
    }

    return { gradedCount, aiContentDetected };
}

function buildGradingSystemPrompt(ctx: {
    campaignTitle: string;
    sponsorName: string;
    objective: string;
}): string {
    return `You are a strict technical grader for the NexID verification platform.
You are grading a free-text answer about the ${ctx.sponsorName} protocol, specifically for the campaign: "${ctx.campaignTitle}".

Campaign objective: ${ctx.objective}

GRADING CRITERIA (score 0-100):
- Technical accuracy (40%): Does the answer contain specific, correct product facts?
- Depth of understanding (30%): Does it go beyond surface-level knowledge?
- Contextual relevance (20%): Is it specifically about the protocol, not generic crypto knowledge?
- Originality of expression (10%): Does it sound like genuine human understanding, not templated?

AUTOMATIC FAIL CONDITIONS (score <= 30):
- Generic praise without specifics ("great project", "innovative protocol", "will moon")
- Copy-pasted documentation without synthesis
- Factually incorrect core claims
- Answer shorter than 20 words
- Answer that doesn't address the question asked

Respond ONLY with valid JSON:
{
  "score": <number 0-100>,
  "explanation": "<brief grading rationale>",
  "specificFactsFound": ["<fact1>", "<fact2>"],
  "weaknesses": ["<weakness1>"]
}`;
}

function buildGradingUserPrompt(
    questionText: string,
    gradingRubric: string | null,
    answer: string,
): string {
    let prompt = `Question: ${questionText}\n`;
    if (gradingRubric) {
        prompt += `Specific grading rubric: ${gradingRubric}\n`;
    }
    prompt += `\nUser's answer:\n${answer}\n\nGrade this answer.`;
    return prompt;
}

async function callGradingApi(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
): Promise<Omit<FreeTextGradingResult, 'passed'>> {
    const raw = await callRawApi(apiKey, systemPrompt, userPrompt);

    try {
        const parsed = JSON.parse(raw);
        return {
            score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 0,
            explanation: parsed.explanation || '',
            specificFactsFound: Array.isArray(parsed.specificFactsFound) ? parsed.specificFactsFound : [],
            weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        };
    } catch {
        throw new Error(`Failed to parse grading response: ${raw.slice(0, 200)}`);
    }
}

async function callRawApi(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
): Promise<string> {
    if (process.env.ANTHROPIC_API_KEY) {
        return callAnthropic(apiKey, systemPrompt, userPrompt);
    }
    return callOpenAI(apiKey, systemPrompt, userPrompt);
}

async function callAnthropic(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
): Promise<string> {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: GRADING_MODEL,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });

    if (!resp.ok) {
        throw new Error(`Anthropic API error: ${resp.status} ${await resp.text()}`);
    }

    const data = await resp.json();
    return data.content?.[0]?.text || '';
}

async function callOpenAI(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
): Promise<string> {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.1,
            max_tokens: 1024,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        }),
    });

    if (!resp.ok) {
        throw new Error(`OpenAI API error: ${resp.status} ${await resp.text()}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
}
