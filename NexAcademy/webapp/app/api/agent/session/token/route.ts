import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import {
  generateEphemeralToken,
  buildSessionConfig,
} from '@/lib/services/gemini-live.service';
import prisma from '@/lib/prisma';

// ── IP Rate Limiter (3 requests per IP per hour) ────────────────────────────

const IP_LIMIT = 3;
const IP_WINDOW_MS = 3_600_000; // 1 hour
const ipLimiter = new Map<string, { count: number; resetAt: number }>();

function hashIp(ip: string): string {
  const salt = process.env.SYBIL_HASH_SALT || 'nexid-ip-salt';
  return crypto.createHmac('sha256', salt).update(ip).digest('hex').slice(0, 16);
}

function checkIpRateLimit(ip: string): boolean {
  const key = hashIp(ip);
  const now = Date.now();
  const entry = ipLimiter.get(key);

  if (!entry || now >= entry.resetAt) {
    ipLimiter.set(key, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true;
  }

  if (entry.count >= IP_LIMIT) return false;
  entry.count++;
  return true;
}

// Periodic cleanup to avoid unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipLimiter) {
    if (now >= entry.resetAt) ipLimiter.delete(key);
  }
}, 600_000); // every 10 minutes

/**
 * POST /api/agent/session/token
 *
 * Generate an ephemeral Gemini Live API token + session config for the client.
 * Called after session/start — requires an ACTIVE session.
 *
 * Body: { sessionId }
 *
 * Returns: {
 *   token,            // Ephemeral Gemini API token (short-lived)
 *   model,            // Gemini model ID
 *   systemInstruction,// Full system prompt for this session type
 *   voiceName,        // Voice preset
 *   tools,            // Function declarations for tool calling
 *   quizQuestions,    // Fixed question + rubric pairs for live campaign assessments
 *   maxDurationSeconds
 * }
 */
export async function POST(request: NextRequest) {
  // IP rate limiting
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  if (!checkIpRateLimit(clientIp)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 3 session token requests per hour.' },
      { status: 429 },
    );
  }

  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: { sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { sessionId } = body;
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  // Verify session belongs to user and is ACTIVE
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      sessionType: true,
      campaignId: true,
      status: true,
    },
  });

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.userId !== auth.user.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (session.status !== 'ACTIVE') {
    return NextResponse.json(
      { error: `Session is not active (status: ${session.status})` },
      { status: 400 },
    );
  }

  try {
    const [ephemeral, config] = await Promise.all([
      generateEphemeralToken(),
      buildSessionConfig(
        session.id,
        session.sessionType,
        session.campaignId,
        session.userId,
      ),
    ]);

    return NextResponse.json({
      token: ephemeral.token,
      model: ephemeral.model,
      systemInstruction: config.systemInstruction,
      voiceName: config.voiceName,
      tools: config.tools,
      quizQuestions: config.quizQuestions,
      maxDurationSeconds: config.maxDurationSeconds,
    });
  } catch (err) {
    console.error('POST /api/agent/session/token error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate session token';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
