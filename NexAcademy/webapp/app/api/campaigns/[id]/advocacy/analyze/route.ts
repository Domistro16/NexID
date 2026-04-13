import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { resolveCampaignId } from "@/lib/campaign-route";

/**
 * POST /api/campaigns/[id]/advocacy/analyze
 *
 * Analyze a user's advocacy post for originality, context relevance, and AI slop.
 * If approved, awards the PROTOCOL_ADVOCATE badge.
 *
 * Production: replace keyword scoring with NLP/AI backend.
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
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const postText = typeof body?.postText === "string" ? body.postText.trim() : "";

  if (postText.length < 20) {
    return NextResponse.json(
      { error: "Post must be at least 20 characters" },
      { status: 400 },
    );
  }

  // Verify campaign exists
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, title: true, sponsorName: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // ── Signal Analysis (keyword-based demo) ──────────────────────────────
  // In production, replace with NLP/AI backend call
  const analysis = analyzeSignal(postText, campaign.title, campaign.sponsorName);

  // ── Award badge if approved ───────────────────────────────────────────
  if (analysis.verdict === "approved") {
    try {
      await prisma.badge.create({
        data: {
          userId: auth.user.userId,
          type: "PROTOCOL_ADVOCATE",
          campaignId,
        },
      });
    } catch {
      // Already earned (unique constraint) — that's fine
    }
  }

  return NextResponse.json(analysis);
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo signal analysis (keyword-matching heuristic)
// Replace with AI/NLP backend in production
// ─────────────────────────────────────────────────────────────────────────────

const SPAM_INDICATORS = [
  "free airdrop", "claim your", "guaranteed returns", "whitelist",
  "join discord", "1000x", "nfa", "dyor", "giveaway", "dm me",
  "totallylegit", "moonshot", "100x",
];

const SLOP_INDICATORS = [
  "revolutionary", "groundbreaking", "game-changing", "innovative solutions",
  "truly amazing", "incredible protocol", "change the world forever",
  "will change the world", "everyone should use", "the future of",
];

function analyzeSignal(
  postText: string,
  campaignTitle: string,
  sponsorName: string,
): {
  originality: number;
  contextRelevance: number;
  slopScore: number;
  verdict: "approved" | "rejected";
  reason: string;
} {
  const lower = postText.toLowerCase();
  const words = lower.split(/\s+/);
  const uniqueWords = new Set(words);

  // Spam detection
  const spamHits = SPAM_INDICATORS.filter((indicator) =>
    lower.includes(indicator),
  ).length;
  if (spamHits >= 2) {
    return {
      originality: 10,
      contextRelevance: 5,
      slopScore: 95,
      verdict: "rejected",
      reason: "Post flagged as promotional spam. Advocacy must reflect genuine understanding.",
    };
  }

  // AI slop detection
  const slopHits = SLOP_INDICATORS.filter((indicator) =>
    lower.includes(indicator),
  ).length;
  const slopScore = Math.min(95, slopHits * 20 + (spamHits * 15));

  // Context relevance: does it mention the campaign/sponsor?
  const mentionsCampaign = lower.includes(campaignTitle.toLowerCase());
  const mentionsSponsor = lower.includes(sponsorName.toLowerCase());
  const hasHashtags = (postText.match(/#\w+/g) ?? []).length;
  const contextBase = (mentionsCampaign ? 35 : 0) + (mentionsSponsor ? 35 : 0);
  const contextRelevance = Math.min(100, contextBase + Math.min(hasHashtags * 5, 15) + 15);

  // Originality: word diversity, length, unique ratio
  const uniqueRatio = uniqueWords.size / Math.max(words.length, 1);
  const lengthBonus = Math.min(30, Math.floor(postText.length / 10));
  const originality = Math.min(
    100,
    Math.max(10, Math.round(uniqueRatio * 50 + lengthBonus + 20 - slopScore * 0.3)),
  );

  // Verdict
  const approved =
    originality >= 40 && contextRelevance >= 40 && slopScore < 50;

  return {
    originality,
    contextRelevance,
    slopScore,
    verdict: approved ? "approved" : "rejected",
    reason: approved
      ? "Original, contextually relevant advocacy. Signal verified."
      : slopScore >= 50
      ? "Post appears AI-generated or templated. Write in your own words."
      : contextRelevance < 40
      ? "Post lacks specific context about the protocol. Reference what you learned."
      : "Post does not meet originality threshold. Be more specific about your experience.",
  };
}
