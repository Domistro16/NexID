import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import { resolveCampaignId } from "@/lib/campaign-route";

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

  const participant = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId: auth.user.userId } },
    select: { id: true, advocacyCompletedAt: true },
  });

  if (!participant) {
    return NextResponse.json({ error: "Not enrolled in this campaign" }, { status: 403 });
  }

  if (!participant.advocacyCompletedAt) {
    await prisma.campaignParticipant.update({
      where: { id: participant.id },
      data: { advocacyCompletedAt: new Date() },
    });
  }

  return NextResponse.json({
    completed: true,
    advocacyCompletedAt: participant.advocacyCompletedAt ?? new Date().toISOString(),
  });
}
