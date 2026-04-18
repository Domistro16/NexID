import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { resolveCampaignId } from "@/lib/campaign-route";

/**
 * POST /api/campaigns/[id]/advocacy/analyze
 *
 * Stores the user's advocacy tweet URL for later scanning. Actual tweet-text
 * analysis + badge award happens asynchronously in a separate scanner that
 * uses X's paid API — this endpoint only validates the URL shape and, if
 * provided, that the URL handle matches the user's connected X account.
 *
 * Input: { tweetUrl, expectedHandle? }
 */

const TWEET_URL_REGEX =
  /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/i;

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
  const tweetUrl = typeof body?.tweetUrl === "string" ? body.tweetUrl.trim() : "";
  const expectedHandle =
    typeof body?.expectedHandle === "string"
      ? body.expectedHandle.replace(/^@/, "").trim()
      : null;

  const urlMatch = TWEET_URL_REGEX.exec(tweetUrl);
  if (!urlMatch) {
    return NextResponse.json(
      { error: "Invalid tweet URL. Paste a link like https://x.com/yourhandle/status/..." },
      { status: 400 },
    );
  }
  const handleFromUrl = urlMatch[1];

  if (expectedHandle && handleFromUrl.toLowerCase() !== expectedHandle.toLowerCase()) {
    return NextResponse.json(
      {
        error: `This tweet is from @${handleFromUrl}, not your connected X account @${expectedHandle}.`,
      },
      { status: 400 },
    );
  }

  const participant = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
    select: { id: true },
  });
  if (!participant) {
    return NextResponse.json({ error: "Not enrolled in this campaign" }, { status: 403 });
  }

  await prisma.campaignParticipant.update({
    where: { id: participant.id },
    data: {
      advocacyPostUrl: tweetUrl,
      advocacySubmittedAt: new Date(),
    },
  });

  return NextResponse.json({
    submitted: true,
    authorHandle: handleFromUrl,
    tweetUrl,
  });
}
