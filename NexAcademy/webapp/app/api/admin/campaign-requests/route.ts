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
          "id",
          "partnerName",
          "partnerNamespace",
          "campaignTitle",
          "primaryObjective",
          "tier",
          "prizePoolUsdc"::text AS "prizePoolUsdc",
          "briefFileName",
          "callBookedFor",
          "callTimeSlot",
          "callTimezone",
          "callBookingNotes",
          "status",
          "reviewNotes",
          "createdAt",
          "updatedAt"
        FROM "CampaignRequest"
        ${whereClause}
        ORDER BY "createdAt" DESC
      `,
    );

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("GET /api/admin/campaign-requests error", error);
    return NextResponse.json({ error: "Failed to fetch campaign requests" }, { status: 500 });
  }
}
