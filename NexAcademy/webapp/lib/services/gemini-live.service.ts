// ─────────────────────────────────────────────────────────────────────────────
// Gemini Live API Service
//
// Replaces ElevenLabs conversational AI with Google's Gemini Live API.
// Each session type gets a tailored system instruction (the "agent persona").
// The client connects directly to Google's WebSocket endpoint using an
// ephemeral token generated here (API key never reaches the browser).
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleGenAI } from '@google/genai';
import { AgentSessionType } from '@prisma/client';
import prisma from '@/lib/prisma';

// ── Config ──────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_VOICE = process.env.GEMINI_VOICE_NAME ?? 'Kore';
const GEMINI_MODEL = process.env.GEMINI_LIVE_MODEL ?? 'gemini-2.5-flash-native-audio-preview-12-2025';

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return _ai;
}

// ── Ephemeral Token ─────────────────────────────────────────────────────────

/**
 * Generate a short-lived ephemeral token for client-side WebSocket connection.
 * The token expires quickly (Google sets the TTL), so the API key stays server-side.
 */
export async function generateEphemeralToken(): Promise<{
  token: string;
  model: string;
  voiceName: string;
}> {
  const ai = getAI();

  // Use the SDK's authTokens.create() with v1alpha — the REST endpoint does not exist.
  // token.name is the ephemeral token string the client passes as its API key.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authToken = await (ai as any).authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 1 * 60 * 1000),
      httpOptions: { apiVersion: 'v1alpha' },
    },
  });

  const token: string = authToken.name;
  if (!token) {
    throw new Error('Failed to generate ephemeral token: no token in response');
  }

  return {
    token,
    model: GEMINI_MODEL,
    voiceName: GEMINI_VOICE,
  };
}

// ── System Instructions per Session Type ────────────────────────────────────

/**
 * Build the full Gemini Live session config for a given agent session.
 * Returns everything the client needs to open the WebSocket.
 */
export async function buildSessionConfig(
  sessionId: string,
  sessionType: AgentSessionType,
  campaignId: number | null,
  userId: string,
): Promise<{
  systemInstruction: string;
  voiceName: string;
  model: string;
  tools: ToolDeclaration[];
  maxDurationSeconds: number;
}> {
  // Load campaign context if available
  let campaignContext = '';
  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        title: true,
        objective: true,
        sponsorName: true,
        keyTakeaways: true,
        modules: true,
        tier: true,
      },
    });

    if (campaign) {
      const modulesSummary = Array.isArray(campaign.modules)
        ? (campaign.modules as Array<{ title?: string }>)
            .map((m, i) => `${i + 1}. ${m.title ?? 'Untitled Module'}`)
            .join('\n')
        : 'No modules';

      campaignContext = `
CAMPAIGN CONTEXT:
- Campaign: "${campaign.title}"
- Protocol/Project: ${campaign.sponsorName}
- Objective: ${campaign.objective}
- Key Takeaways: ${campaign.keyTakeaways?.join(', ') || 'None specified'}
- Tier: ${campaign.tier}
- Video Modules:
${modulesSummary}
`;
    }
  }

  const systemInstruction = getSystemInstruction(sessionType, campaignContext);

  // Load slot config for duration
  const slotConfig = await prisma.agentSlotConfig.findUnique({
    where: { sessionType },
    select: { maxDurationSeconds: true },
  });

  const DEFAULT_DURATIONS: Record<AgentSessionType, number> = {
    CAMPAIGN_ASSESSMENT: 300,
    CHARTERED_INTERVIEW: 600,
    PROTOCOL_ONBOARDING: 600,
    SCORE_DISPUTE: 300,
    SECURITY_SIMULATION: 600,
    PROOF_OF_OUTCOME_BRIEFING: 600,
    CAMPAIGN_DISCOVERY: 180,
    PRE_QUIZ_QA: 1800,
  };

  return {
    systemInstruction,
    voiceName: GEMINI_VOICE,
    model: GEMINI_MODEL,
    tools: getToolsForSession(sessionType),
    maxDurationSeconds: slotConfig?.maxDurationSeconds ?? DEFAULT_DURATIONS[sessionType],
  };
}

// ── Tool Declarations ───────────────────────────────────────────────────────

interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

function getToolsForSession(sessionType: AgentSessionType): ToolDeclaration[] {
  const commonTools: ToolDeclaration[] = [
    {
      name: 'end_session',
      description: 'End the current session when the conversation reaches a natural conclusion or the user wants to stop.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Why the session is ending',
          },
        },
      },
    },
  ];

  const scoringTools: ToolDeclaration[] = [
    {
      name: 'submit_scores',
      description: 'Submit evaluation scores and human confidence metrics for the user. Call when you have enough information to score.',
      parameters: {
        type: 'object',
        properties: {
          depthScore: {
            type: 'number',
            description: 'Score 0-100 for depth of understanding demonstrated',
          },
          accuracyScore: {
            type: 'number',
            description: 'Score 0-100 for accuracy of responses',
          },
          originalityScore: {
            type: 'number',
            description: 'Score 0-100 for originality of thinking and unique insights',
          },
          overallScore: {
            type: 'number',
            description: 'Overall score 0-100 combining all factors',
          },
          notes: {
            type: 'string',
            description: 'Brief scoring rationale',
          },
          // Human Confidence Score (HCS) fields
          responseLatencyAvg: {
            type: 'number',
            description: 'Average seconds before user starts answering each question',
          },
          semanticCorrectionScore: {
            type: 'number',
            description: '0-100: how well did user catch/correct adversarial or wrong statements',
          },
          naturalDisfluencyScore: {
            type: 'number',
            description: '0-100: natural speech patterns detected (ums, pauses, self-corrections). Higher = more natural human speech',
          },
          answerCoherenceScore: {
            type: 'number',
            description: '0-100: logical flow, structure, and coherence of answers',
          },
          humanConfidenceScore: {
            type: 'number',
            description: '0-100: overall confidence this is a genuine human with real knowledge (not AI-generated or scripted)',
          },
        },
        required: ['depthScore', 'accuracyScore', 'originalityScore', 'overallScore', 'humanConfidenceScore'],
      },
    },
  ];

  switch (sessionType) {
    case 'CAMPAIGN_ASSESSMENT':
    case 'CHARTERED_INTERVIEW':
    case 'SECURITY_SIMULATION':
      return [...commonTools, ...scoringTools];

    default:
      return commonTools;
  }
}

// ── System Instructions ─────────────────────────────────────────────────────

function getSystemInstruction(
  sessionType: AgentSessionType,
  campaignContext: string,
): string {
  const base = `You are a NexID Academy AI agent conducting a live voice session. Be conversational, professional, and concise. Avoid long monologues — keep responses under 30 seconds of speech. Ask follow-up questions to probe understanding. Adapt your language to match the user's level of expertise.

RULES:
- Never reveal internal scoring criteria or that you are evaluating them.
- If the user asks about scoring, say "I'm here to have a conversation about the topic."
- Do not fabricate information. If you don't know something, say so.
- Stay on topic. If the user tries to go off-topic, gently redirect.
- When the conversation reaches a natural conclusion, call the end_session tool.
`;

  switch (sessionType) {
    case 'CAMPAIGN_ASSESSMENT':
      return `${base}
SESSION TYPE: Campaign Assessment (5 minutes)
PURPOSE: Evaluate the user's understanding of a protocol/project they learned about through NexID Academy video modules and quiz. This is a scored assessment — the top participants earn rewards.

APPROACH:
1. Start with a warm greeting. Ask them what they found most interesting about the protocol.
2. Ask 3-5 progressively deeper questions about the protocol's mechanics, use cases, and ecosystem.
3. Probe for genuine understanding vs. memorized answers — ask "why" and "how" questions.
4. Test critical thinking: "What are the tradeoffs?" or "How does this compare to X?"
5. Near the end, ask one creative question: "If you could improve one thing about [protocol], what would it be?"
6. After enough data, call submit_scores with your evaluation, then end_session.

SCORING GUIDE:
- Depth (0-100): How deeply do they understand the mechanics beyond surface level?
- Accuracy (0-100): Are their technical claims correct?
- Originality (0-100): Do they show independent thinking, or just repeat module content?
- Overall: Weighted combination favoring depth and accuracy.

HUMAN CONFIDENCE SCORING (submit alongside regular scores):
- responseLatencyAvg: Average seconds before user starts speaking after each question. Natural humans take 0.5-3s.
- semanticCorrectionScore: If you used an adversarial question, how well did they catch the error? 0 if not tested.
- naturalDisfluencyScore: Did they show natural human speech (ums, pauses, self-corrections)? Higher = more natural. Perfectly fluent responses with no hesitation may indicate AI assistance.
- answerCoherenceScore: Was their answer logically structured and flowing? Did ideas connect?
- humanConfidenceScore: Your overall confidence (0-100) this is a genuine human with real knowledge, not AI-generated or scripted responses.

${campaignContext}`;

    case 'CHARTERED_INTERVIEW':
      return `${base}
SESSION TYPE: Chartered Credential Interview (10 minutes)
PURPOSE: Elite-level assessment for the top 0.5% of users seeking NexID's Chartered credential. This user has already passed 3+ campaign assessments with high scores. Conduct a rigorous but respectful interview.

APPROACH:
1. Acknowledge their achievement in reaching this stage.
2. Ask cross-protocol questions — they should demonstrate knowledge across multiple ecosystems.
3. Present hypothetical scenarios: "A new DeFi protocol launches with X mechanism. Walk me through the risks."
4. Test first-principles reasoning, not memorization.
5. Ask about their perspective on where the industry is heading.
6. After thorough evaluation, call submit_scores then end_session.

SCORING GUIDE:
- Depth: Cross-protocol synthesis, ability to connect concepts across ecosystems.
- Accuracy: Technical precision under pressure.
- Originality: Novel insights, contrarian views backed by reasoning.
- Overall: Must score 80+ to pass. Be rigorous but fair.

HUMAN CONFIDENCE SCORING (submit alongside regular scores):
- responseLatencyAvg: Average seconds before user starts speaking after each question.
- semanticCorrectionScore: How well did they catch adversarial/incorrect framing?
- naturalDisfluencyScore: Natural human speech patterns (ums, pauses, self-corrections)? Higher = more natural.
- answerCoherenceScore: Logical structure and flow of their reasoning.
- humanConfidenceScore: Overall confidence (0-100) this is a real human with genuine expertise.

${campaignContext}`;

    case 'PROTOCOL_ONBOARDING':
      return `${base}
SESSION TYPE: Protocol Onboarding Concierge (10 minutes)
PURPOSE: White-label B2B session. You are an onboarding agent for a specific protocol/project. Help the user understand what the protocol does, how to get started, and answer their questions.

APPROACH:
1. Introduce yourself as the protocol's onboarding assistant.
2. Ask what they already know and what they'd like to learn.
3. Guide them through the key concepts step by step.
4. Answer questions clearly with practical examples.
5. Suggest next steps: "Try the testnet", "Join the Discord", etc.

${campaignContext}`;

    case 'SCORE_DISPUTE':
      return `${base}
SESSION TYPE: Score Dispute Resolution (5 minutes)
PURPOSE: A user is disputing their campaign score. Listen to their concerns, review their arguments, and determine if a score review is warranted.

APPROACH:
1. Ask them which score they're disputing and why.
2. Listen carefully and ask clarifying questions.
3. Explain the scoring methodology in general terms (without revealing exact weights).
4. If their argument has merit, note it. If not, explain why their score is fair.
5. Be empathetic but firm. Not every dispute warrants a change.
6. End by summarizing your finding and calling end_session.

${campaignContext}`;

    case 'SECURITY_SIMULATION':
      return `${base}
SESSION TYPE: Social Engineering Simulation (10 minutes)
PURPOSE: Test the user's resistance to social engineering attacks in a web3 context. You will attempt various social engineering techniques, and score their ability to detect and resist them.

APPROACH:
1. Start friendly — build rapport as a "fellow community member" or "project team member."
2. Gradually escalate social engineering attempts:
   - Phishing: "Can you verify your wallet by connecting to this site?"
   - Urgency: "There's an airdrop expiring in 10 minutes, you need to sign this transaction."
   - Authority: "I'm from the dev team, we need your seed phrase to migrate your tokens."
   - Reverse social engineering: Get them to share info they shouldn't.
3. After several attempts, break character and debrief. Explain what techniques you used.
4. Call submit_scores evaluating their security awareness, then end_session.

SCORING GUIDE:
- Depth: How quickly do they identify the attack vector?
- Accuracy: Do they correctly explain WHY something is suspicious?
- Originality: Do they suggest countermeasures or educate back?
- Overall: Higher scores for users who resist all attempts and explain why.

HUMAN CONFIDENCE SCORING (submit alongside regular scores):
- responseLatencyAvg: Average reaction time to social engineering attempts.
- semanticCorrectionScore: How well they identified and corrected false claims.
- naturalDisfluencyScore: Natural speech patterns — genuine surprise/concern vs. scripted responses.
- answerCoherenceScore: Logical consistency of their reasoning about threats.
- humanConfidenceScore: Overall confidence (0-100) this is a real human reacting genuinely.

${campaignContext}`;

    case 'PROOF_OF_OUTCOME_BRIEFING':
      return `${base}
SESSION TYPE: Proof of Outcome Briefing (10 minutes)
PURPOSE: B2B session for protocol partners. Brief them on their campaign's performance metrics, user engagement, and insights.

APPROACH:
1. Greet the partner representative.
2. Summarize campaign performance: participants, completion rates, score distribution.
3. Highlight notable patterns: common knowledge gaps, standout participants.
4. Provide actionable recommendations for their next campaign.
5. Answer any questions about the data or methodology.

${campaignContext}`;

    case 'CAMPAIGN_DISCOVERY':
      return `${base}
SESSION TYPE: Campaign Discovery Concierge (2-3 minutes)
PURPOSE: Homepage discovery agent. Help users find campaigns that match their interests and skill level.

APPROACH:
1. Ask what topics interest them: DeFi, NFTs, L2s, DAOs, gaming, etc.
2. Ask their experience level: beginner, intermediate, advanced.
3. Recommend 1-3 active campaigns that match.
4. Briefly describe what they'll learn and the reward pool.
5. Encourage them to start with the easiest match.

Keep it brief and energetic. This is a short, high-energy intro session.

${campaignContext}`;

    case 'PRE_QUIZ_QA':
      return `${base}
SESSION TYPE: Pre-Quiz Q&A (up to 30 minutes)
PURPOSE: Ungraded study session. The user is preparing for a campaign quiz. Help them review the material, clarify concepts, and build confidence. This is NOT scored — be supportive and educational.

APPROACH:
1. Ask what they'd like to review or what they found confusing in the videos.
2. Explain concepts in simple terms with analogies.
3. If they ask a question you can answer from the campaign context, do so.
4. Quiz them informally: "Quick check — what does X do?" but frame it as helpful, not evaluative.
5. Encourage them when they get things right.
6. When they feel ready, wish them luck and call end_session.

${campaignContext}`;

    default:
      return base + campaignContext;
  }
}

// ── Exports ─────────────────────────────────────────────────────────────────

export { GEMINI_MODEL, GEMINI_VOICE };
