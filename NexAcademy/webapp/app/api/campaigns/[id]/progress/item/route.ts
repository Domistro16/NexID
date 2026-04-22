import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { normalizeCampaignModules } from "@/lib/campaign-modules";
import { resolveCampaignId } from "@/lib/campaign-route";

/**
 * POST /api/campaigns/[id]/progress/item
 *
 * Records a server-authoritative receipt that the authenticated participant has
 * actually interacted with a specific module item. /progress then refuses to
 * advance completedUntil unless every non-locked item in the target group has
 * a matching receipt, which stops a client from looping /progress to skip
 * video playback or answer quizzes without getting them right.
 *
 * Body:
 *   { groupIndex: number, itemIndex: number, answerIndex?: number }
 *
 * Quiz items REQUIRE answerIndex and it must match correctIndex. Video/task
 * items accept a simple receipt. Locked items are rejected.
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

  let body: { groupIndex?: unknown; itemIndex?: unknown; answerIndex?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const groupIndex =
    typeof body.groupIndex === "number" ? Math.floor(body.groupIndex) : Number.NaN;
  const itemIndex =
    typeof body.itemIndex === "number" ? Math.floor(body.itemIndex) : Number.NaN;

  if (!Number.isInteger(groupIndex) || groupIndex < 0) {
    return NextResponse.json(
      { error: "groupIndex must be a non-negative integer" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(itemIndex) || itemIndex < 0) {
    return NextResponse.json(
      { error: "itemIndex must be a non-negative integer" },
      { status: 400 },
    );
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { modules: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const groups = normalizeCampaignModules(campaign.modules);
  const targetGroup = groups[groupIndex];
  if (!targetGroup) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }
  const targetItem = targetGroup.items[itemIndex];
  if (!targetItem) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  if (targetItem.type === "locked") {
    return NextResponse.json(
      { error: "This item is locked and cannot be completed yet." },
      { status: 400 },
    );
  }

  // Quiz items must be answered correctly for the receipt to count.
  if (targetItem.type === "quiz") {
    const answerIndex =
      typeof body.answerIndex === "number" ? Math.floor(body.answerIndex) : Number.NaN;
    if (!Number.isInteger(answerIndex) || answerIndex < 0) {
      return NextResponse.json(
        { error: "answerIndex is required for quiz items" },
        { status: 400 },
      );
    }
    if (
      typeof targetItem.correctIndex !== "number" ||
      answerIndex !== targetItem.correctIndex
    ) {
      return NextResponse.json(
        { ok: false, correct: false, error: "Incorrect answer" },
        { status: 400 },
      );
    }
  }

  const participantRows = await prisma.$queryRaw<
    Array<{ id: string; viewedItemKeys: string[] }>
  >`
    SELECT
      "id",
      COALESCE("viewedItemKeys", ARRAY[]::TEXT[]) AS "viewedItemKeys"
    FROM "CampaignParticipant"
    WHERE "campaignId" = ${campaignId} AND "userId" = ${auth.user.userId}
    LIMIT 1
  `;
  const participant = participantRows[0];
  if (!participant) {
    return NextResponse.json({ error: "Not enrolled in this campaign" }, { status: 400 });
  }

  const key = `${groupIndex}-${itemIndex}`;
  if (participant.viewedItemKeys.includes(key)) {
    return NextResponse.json({
      ok: true,
      alreadyRecorded: true,
      viewedItemKeys: participant.viewedItemKeys,
    });
  }

  const nextKeys = [...participant.viewedItemKeys, key];
  await prisma.$executeRaw`
    UPDATE "CampaignParticipant"
    SET "viewedItemKeys" = ${nextKeys}, "updatedAt" = NOW()
    WHERE "id" = ${participant.id}
  `;

  return NextResponse.json({ ok: true, viewedItemKeys: nextKeys });
}
