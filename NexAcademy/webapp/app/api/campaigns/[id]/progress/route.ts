import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { getCampaignModuleCount, normalizeCompletedUntil } from "@/lib/campaign-modules";



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
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
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

  const participantRows = await prisma.$queryRaw<
    Array<{ id: string; completedAt: Date | null; completedUntil: number }>
  >`
    SELECT
      "id",
      "completedAt",
      COALESCE("completedUntil", -1) AS "completedUntil"
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
