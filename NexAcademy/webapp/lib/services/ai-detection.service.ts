import { flagAiContent } from './shadow-ban.service';

// ─────────────────────────────────────────────────────────────────────────────
// AI-Generated Content Detection Service
//
// Strategy: "AI detection is a signal, not a verdict. Shadow-ban (score to zero
// silently) rather than hard-block — prevents detection arms race."
//
// Detects: excessive formality, generic praise, perfect structure with no
// personal context, LLM-typical patterns.
//
// When detected: calls flagAiContent() → shadow-ban → score silently zeroed.
// ─────────────────────────────────────────────────────────────────────────────

/** Confidence threshold above which we trigger a shadow-ban */
const SHADOW_BAN_THRESHOLD = 0.85;

/** Confidence threshold for flagging (logged but not banned) */
const FLAG_THRESHOLD = 0.6;

// ── Types ───────────────────────────────────────────────────────────────────

export interface AiDetectionResult {
    isLikelyAi: boolean;
    confidence: number;         // 0.0–1.0
    signals: string[];          // What triggered the detection
    shouldShadowBan: boolean;   // confidence >= SHADOW_BAN_THRESHOLD
    shouldFlag: boolean;        // confidence >= FLAG_THRESHOLD
}

// ── Core Detection ──────────────────────────────────────────────────────────

/**
 * Analyze a free-text answer for AI-generated content patterns.
 *
 * Uses a combination of:
 * 1. Heuristic checks (fast, no API call)
 * 2. AI-based classification (if heuristics are inconclusive)
 */
export async function detectAiContent(
    text: string,
    context: {
        questionText: string;
        campaignTitle: string;
    },
): Promise<AiDetectionResult> {
    // Step 1: Heuristic checks (free, instant)
    const heuristic = runHeuristicChecks(text);
    if (heuristic.confidence >= SHADOW_BAN_THRESHOLD) {
        return heuristic;
    }

    // Step 2: AI-based classification (costs money, more accurate)
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        // No API key — rely on heuristics only
        return heuristic;
    }

    try {
        const aiResult = await classifyWithAi(apiKey, text, context);
        // Combine heuristic and AI signals
        const combinedConfidence = Math.max(heuristic.confidence, aiResult.confidence);
        const combinedSignals = [...new Set([...heuristic.signals, ...aiResult.signals])];

        return {
            isLikelyAi: combinedConfidence >= FLAG_THRESHOLD,
            confidence: combinedConfidence,
            signals: combinedSignals,
            shouldShadowBan: combinedConfidence >= SHADOW_BAN_THRESHOLD,
            shouldFlag: combinedConfidence >= FLAG_THRESHOLD,
        };
    } catch (err) {
        console.error('AI detection API call failed:', err);
        return heuristic;
    }
}

/**
 * Run detection on a quiz answer and apply shadow-ban if detected.
 * Returns the detection result.
 */
export async function detectAndEnforce(
    text: string,
    userId: string,
    campaignId: number,
    context: {
        questionText: string;
        campaignTitle: string;
        fieldName: string;
    },
): Promise<AiDetectionResult> {
    const result = await detectAiContent(text, context);

    if (result.shouldShadowBan) {
        await flagAiContent(userId, campaignId, {
            field: context.fieldName,
            confidence: result.confidence,
            snippet: text.slice(0, 200),
        });
    }

    return result;
}

// ── Heuristic Checks ────────────────────────────────────────────────────────

function runHeuristicChecks(text: string): AiDetectionResult {
    const signals: string[] = [];
    let score = 0;

    const words = text.split(/\s+/);
    const sentences = text.split(/[.!?]+/).filter(Boolean);

    // 1. Excessive formality markers
    const formalPhrases = [
        'it is worth noting',
        'it is important to',
        'in conclusion',
        'furthermore',
        'moreover',
        'in summary',
        'to summarize',
        'it should be noted',
        'one could argue',
        'in the context of',
        'it is evident that',
        'as previously mentioned',
        'this demonstrates',
        'this highlights',
        'this underscores',
    ];
    const lowerText = text.toLowerCase();
    const formalCount = formalPhrases.filter((p) => lowerText.includes(p)).length;
    if (formalCount >= 3) {
        signals.push(`Excessive formal phrases (${formalCount})`);
        score += 0.3;
    } else if (formalCount >= 2) {
        signals.push(`Multiple formal phrases (${formalCount})`);
        score += 0.15;
    }

    // 2. Perfect structure (numbered lists, bullet-point style in short answers)
    const numberedPattern = /^\d+[\.\)]\s/gm;
    const numberedMatches = text.match(numberedPattern);
    if (numberedMatches && numberedMatches.length >= 3 && words.length < 150) {
        signals.push('Structured numbered list in short answer');
        score += 0.2;
    }

    // 3. Suspiciously uniform sentence length
    if (sentences.length >= 4) {
        const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
        const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const variance = lengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / lengths.length;
        const cv = Math.sqrt(variance) / avg;
        if (cv < 0.15 && avg > 8) {
            signals.push('Suspiciously uniform sentence length');
            score += 0.2;
        }
    }

    // 4. Generic praise without specifics
    const genericPhrases = [
        'innovative approach',
        'cutting-edge',
        'revolutionary',
        'game-changer',
        'next-generation',
        'state-of-the-art',
        'paradigm shift',
        'best-in-class',
        'world-class',
        'robust and scalable',
    ];
    const genericCount = genericPhrases.filter((p) => lowerText.includes(p)).length;
    if (genericCount >= 2) {
        signals.push(`Generic praise patterns (${genericCount})`);
        score += 0.25;
    }

    // 5. Hedging language (common in LLM outputs)
    const hedging = [
        'it\'s important to note',
        'while there are',
        'on the other hand',
        'having said that',
        'that being said',
        'it can be argued',
        'there are several',
        'various aspects',
    ];
    const hedgeCount = hedging.filter((h) => lowerText.includes(h)).length;
    if (hedgeCount >= 2) {
        signals.push(`Hedging language patterns (${hedgeCount})`);
        score += 0.15;
    }

    // 6. Suspiciously long answer for a timed quiz
    if (words.length > 300) {
        signals.push('Unusually long answer for a 60-second timed question');
        score += 0.3;
    } else if (words.length > 200) {
        signals.push('Long answer for timed question');
        score += 0.15;
    }

    // 7. No personal/first-person language at all
    const firstPerson = /\b(i|my|me|i'm|i've|i'd|mine)\b/i;
    if (!firstPerson.test(text) && words.length > 50) {
        signals.push('No first-person language in substantial answer');
        score += 0.1;
    }

    const confidence = Math.min(score, 1.0);

    return {
        isLikelyAi: confidence >= FLAG_THRESHOLD,
        confidence,
        signals,
        shouldShadowBan: confidence >= SHADOW_BAN_THRESHOLD,
        shouldFlag: confidence >= FLAG_THRESHOLD,
    };
}

// ── AI-Based Classification ─────────────────────────────────────────────────

async function classifyWithAi(
    apiKey: string,
    text: string,
    context: { questionText: string; campaignTitle: string },
): Promise<{ confidence: number; signals: string[] }> {
    const systemPrompt = `You are an AI-generated content detector for quiz answers on the NexID platform.
Analyze whether the following answer was written by a human or generated by an AI (ChatGPT, Claude, etc.).

Consider:
1. Does it have genuine personal voice and perspective?
2. Does it contain LLM-typical patterns (hedging, excessive structure, generic praise)?
3. Does it show genuine understanding vs. surface-level paraphrasing?
4. Is the language overly polished for a timed quiz answer?
5. Does it reference specific details that suggest real learning vs. generic knowledge?

The question was about the campaign "${context.campaignTitle}".
Question: ${context.questionText}

Respond ONLY with valid JSON:
{"confidence": <0.0-1.0>, "signals": ["<signal1>", "<signal2>"]}

Where confidence is the probability the text is AI-generated (1.0 = certainly AI).`;

    const useAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const url = useAnthropic
        ? 'https://api.anthropic.com/v1/messages'
        : 'https://api.openai.com/v1/chat/completions';

    const headers: Record<string, string> = useAnthropic
        ? {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        }
        : {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        };

    const payload = useAnthropic
        ? {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 256,
            system: systemPrompt,
            messages: [{ role: 'user', content: `Answer to analyze:\n${text}` }],
        }
        : {
            model: 'gpt-4o-mini',
            temperature: 0,
            max_tokens: 256,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Answer to analyze:\n${text}` },
            ],
        };

    const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });

    if (!resp.ok) {
        throw new Error(`AI detection API error: ${resp.status}`);
    }

    const data = await resp.json();
    const raw = process.env.ANTHROPIC_API_KEY
        ? data.content?.[0]?.text || '{}'
        : data.choices?.[0]?.message?.content || '{}';

    try {
        const parsed = JSON.parse(raw);
        return {
            confidence: typeof parsed.confidence === 'number'
                ? Math.max(0, Math.min(1, parsed.confidence))
                : 0,
            signals: Array.isArray(parsed.signals) ? parsed.signals : [],
        };
    } catch {
        return { confidence: 0, signals: ['Failed to parse AI detection response'] };
    }
}
