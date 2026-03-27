import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import {
  buildPartnerCallSlotCalendar,
  DEFAULT_PARTNER_CALL_SLOT_DAYS,
  normalizePartnerCallDate,
} from "@/lib/partner-call-slots";

type BookedSlotRow = {
  callBookedFor: Date;
  callTimeSlot: string;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const partner = await prisma.partner.findUnique({
      where: { userId: auth.user.userId },
      select: { id: true },
    });

    if (!partner) {
      return NextResponse.json(
        { error: "Partner profile not found. Complete onboarding first." },
        { status: 403 },
      );
    }

    const requestedStart =
      normalizePartnerCallDate(request.nextUrl.searchParams.get("from") || "") ??
      new Date().toISOString().slice(0, 10);

    const requestedDays = Number(request.nextUrl.searchParams.get("days") || "");
    const days =
      Number.isFinite(requestedDays) && requestedDays > 0
        ? Math.min(Math.floor(requestedDays), 31)
        : DEFAULT_PARTNER_CALL_SLOT_DAYS;

    const rangeStart = new Date(`${requestedStart}T00:00:00.000Z`);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setUTCDate(rangeStart.getUTCDate() + days);

    const bookedSlots = await prisma.$queryRaw<BookedSlotRow[]>`
      SELECT
        "callBookedFor",
        "callTimeSlot"
      FROM "CampaignRequest"
      WHERE
        "callBookedFor" IS NOT NULL
        AND "callTimeSlot" IS NOT NULL
        AND "status" IN ('PENDING'::"CampaignRequestStatus", 'APPROVED'::"CampaignRequestStatus")
        AND "callBookedFor" >= ${rangeStart}
        AND "callBookedFor" < ${rangeEnd}
    `;

    const bookedSlotKeys = new Set(
      bookedSlots.map((slot) => {
        const date = slot.callBookedFor.toISOString().slice(0, 10);
        return `${date}:${slot.callTimeSlot}`;
      }),
    );

    return NextResponse.json({
      rangeStart: requestedStart,
      rangeEnd: rangeEnd.toISOString().slice(0, 10),
      days: buildPartnerCallSlotCalendar(requestedStart, days, bookedSlotKeys),
    });
  } catch (error) {
    console.error("GET /api/partner/call-slots error", error);
    return NextResponse.json(
      { error: "Failed to fetch call slot availability" },
      { status: 500 },
    );
  }
}
