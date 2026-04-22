import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import {
  getCampaignModuleCount,
  normalizeCampaignModules,
  normalizeCompletedUntil,
} from "@/lib/campaign-modules";
import { resolveCampaignId } from "@/lib/campaign-route";



/**
 * POST /api/campaigns/[id]/progress
 * Persist per-module completion progress for the authenticated participant.
 *
 * Body: { moduleIndex: number }
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

  let body: { moduleIndex?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const moduleIndex =
    typeof body.moduleIndex === "number" ? Math.floor(body.moduleIndex) : Number.NaN;
  if (!Number.isInteger(moduleIndex) || moduleIndex < 0) {
    return NextResponse.json({ error: "moduleIndex must be a non-negative integer" }, { status: 400 });
  }


  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { modules: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const moduleCount = getCampaignModuleCount(campaign.modules);
  if (moduleCount === 0) {
    return NextResponse.json({ error: "Campaign modules are not configured yet" }, { status: 400 });
  }
  if (moduleIndex >= moduleCount) {
    return NextResponse.json(
      { error: `moduleIndex must be between 0 and ${moduleCount - 1}` },
      { status: 400 },
    );
  }

  // A module group whose items are all type:"locked" is a coming-soon
  // placeholder. Users can view it but cannot mark it complete, which
  // naturally keeps the quiz / on-chain / live AI assessment stages
  // gated until the admin publishes real content.
  const normalizedGroups = normalizeCampaignModules(campaign.modules);
  const targetGroup = normalizedGroups[moduleIndex];
  if (!targetGroup) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }
  if (
    targetGroup.items.length > 0 &&
    targetGroup.items.every((item) => item.type === "locked")
  ) {
    return NextResponse.json(
      { error: "This module is coming soon and cannot be completed yet." },
      { status: 400 },
    );
  }

  const participantRows = await prisma.$queryRaw<
    Array<{
      id: string;
      completedAt: Date | null;
      completedUntil: number;
      viewedItemKeys: string[];
    }>
  >`
    SELECT
      "id",
      "completedAt",
      COALESCE("completedUntil", -1) AS "completedUntil",
      COALESCE("viewedItemKeys", ARRAY[]::TEXT[]) AS "viewedItemKeys"
    FROM "CampaignParticipant"
    WHERE "campaignId" = ${campaignId} AND "userId" = ${auth.user.userId}
    LIMIT 1
  `;
  const participant = participantRows[0];

  if (!participant) {
    return NextResponse.json({ error: "Not enrolled in this campaign" }, { status: 400 });
  }

  if (participant.completedAt) {
    const normalizedCompletedUntil = normalizeCompletedUntil(
      campaign.modules,
      participant.completedUntil,
    );
    return NextResponse.json({
      saved: true,
      completedUntil: normalizedCompletedUntil,
      completedAt: participant.completedAt,
    });
  }

  const normalizedCompletedUntil = normalizeCompletedUntil(
    campaign.modules,
    participant.completedUntil,
  );

  // Enforce sequential completion: can only complete the next module in order
  if (moduleIndex > normalizedCompletedUntil + 1) {
    return NextResponse.json(
      { error: "Complete previous modules first" },
      { status: 400 },
    );
  }

  // Server-authoritative gate: every non-locked item in this group must have a
  // matching receipt in viewedItemKeys. Clients earn receipts only by actually
  // viewing videos / completing tasks / answering quizzes correctly via
  // /progress/item, so this stops a client from looping /progress to skip gates.
  const viewedKeys = new Set(participant.viewedItemKeys ?? []);
  const missingItems: number[] = [];
  targetGroup.items.forEach((item, idx) => {
    if (item.type === "locked") {
      return;
    }
    if (!viewedKeys.has(`${moduleIndex}-${idx}`)) {
      missingItems.push(idx);
    }
  });
  if (missingItems.length > 0) {
    return NextResponse.json(
      {
        error: "Complete every item in this module first",
        missingItems,
      },
      { status: 400 },
    );
  }

  const nextCompletedUntil = Math.max(normalizedCompletedUntil, moduleIndex);
  if (nextCompletedUntil === participant.completedUntil) {
    return NextResponse.json({ saved: true, completedUntil: participant.completedUntil });
  }

  await prisma.$executeRaw`
    UPDATE "CampaignParticipant"
    SET "completedUntil" = ${nextCompletedUntil}, "updatedAt" = NOW()
    WHERE "id" = ${participant.id}
  `;

  return NextResponse.json({ saved: true, completedUntil: nextCompletedUntil });
}
