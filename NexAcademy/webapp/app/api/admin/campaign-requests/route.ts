import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";

const VALID_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

type CampaignRequestRow = {
  id: string;
  partnerName: string;
  partnerNamespace: string | null;
  campaignTitle: string;
  primaryObjective: string;
  tier: string;
  prizePoolUsdc: string;
  briefFileName: string | null;
  callBookedFor: Date | null;
  callTimeSlot: string | null;
  callTimezone: string | null;
  callBookingNotes: string | null;
  status: string;
  reviewNotes: string | null;
  linkedCampaignId: number | null;
  linkedCampaignSlug: string | null;
  linkedCampaignTitle: string | null;
  linkedCampaignStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function GET(request: NextRequest) {
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const statusParam = request.nextUrl.searchParams.get("status")?.toUpperCase() ?? null;
    const statusFilter = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : null;

    const whereClause = statusFilter
      ? Prisma.sql`WHERE "status" = ${statusFilter}::"CampaignRequestStatus"`
      : Prisma.empty;

    const requests = await prisma.$queryRaw<CampaignRequestRow[]>(
      Prisma.sql`
        SELECT
          r."id",
          r."partnerName",
          r."partnerNamespace",
          r."campaignTitle",
          r."primaryObjective",
          r."tier",
          r."prizePoolUsdc"::text AS "prizePoolUsdc",
          r."briefFileName",
          r."callBookedFor",
          r."callTimeSlot",
          r."callTimezone",
          r."callBookingNotes",
          r."status",
          r."reviewNotes",
          c."id" AS "linkedCampaignId",
          c."slug" AS "linkedCampaignSlug",
          c."title" AS "linkedCampaignTitle",
          c."status"::text AS "linkedCampaignStatus",
          r."createdAt",
          r."updatedAt"
        FROM "CampaignRequest" r
        LEFT JOIN "Campaign" c ON c."requestId" = r."id"
        ${whereClause}
        ORDER BY r."createdAt" DESC
      `,
    );

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("GET /api/admin/campaign-requests error", error);
    return NextResponse.json({ error: "Failed to fetch campaign requests" }, { status: 500 });
  }
}
