import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import {
  buildPartnerCallSlotDateTime,
  isValidPartnerCallSlot,
  normalizePartnerCallDate,
  toPartnerCallDate,
} from "@/lib/partner-call-slots";
import {
  getPartnerCampaignPlan,
  isPartnerCampaignPlan,
} from "@/lib/partner-campaign-plans";

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
  try {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const partner = await prisma.partner.findUnique({
      where: { userId: auth.user.userId },
    });

    if (!partner) {
      return NextResponse.json(
        { error: "Partner profile not found. Complete onboarding first." },
        { status: 403 },
      );
    }

    const requests = await prisma.$queryRaw<CampaignRequestRow[]>`
      SELECT
        "id",
        "partnerName",
        "partnerNamespace",
        "campaignTitle",
        "primaryObjective",
        "tier"::text AS "tier",
        "prizePoolUsdc"::text AS "prizePoolUsdc",
        "briefFileName",
        "callBookedFor",
        "callTimeSlot",
        "callTimezone",
        "callBookingNotes",
        "status"::text AS "status",
        "reviewNotes",
        "createdAt",
        "updatedAt"
      FROM "CampaignRequest"
      WHERE
        "submittedById" = ${auth.user.userId}
        OR ("submittedById" IS NULL AND "partnerName" = ${partner.orgName})
      ORDER BY "createdAt" DESC
      LIMIT 50
    `;

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("GET /api/partner/campaign-requests error", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign requests" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const partner = await prisma.partner.findUnique({
      where: { userId: auth.user.userId },
    });
    if (!partner) {
      return NextResponse.json(
        { error: "Partner profile not found. Complete onboarding first." },
        { status: 403 },
      );
    }

    // Only verified partners can submit campaign requests
    if (partner.verificationStatus !== "VERIFIED") {
      return NextResponse.json(
        { error: "Your partner profile must be verified before submitting campaigns. Submit verification at /api/partner/verify." },
        { status: 403 },
      );
    }

    const body = await request.json();

    const partnerName = partner.orgName;
    const partnerNamespace = partner.namespace;
    const campaignTitle = String(body.campaignTitle || "").trim();
    const primaryObjective = String(body.primaryObjective || "").trim();
    const tier = String(body.tier || "").toUpperCase();
    const briefFileName = body.briefFileName ? String(body.briefFileName).trim() : null;
    const prizePoolUsdc = Number(body.prizePoolUsdc);
    const callBookedForRaw = body.callBookedFor ? String(body.callBookedFor).trim() : "";
    const callTimeSlot = String(body.callTimeSlot || "").trim();
    const callTimezone = body.callTimezone ? String(body.callTimezone).trim() : "UTC";
    const callBookingNotes =
      body.callBookingNotes && String(body.callBookingNotes).trim()
        ? String(body.callBookingNotes).trim()
        : null;
    const normalizedCallDate = normalizePartnerCallDate(callBookedForRaw);
    const callBookedFor = normalizedCallDate ? toPartnerCallDate(normalizedCallDate) : null;
    const callSlotStartAt =
      normalizedCallDate && callTimeSlot
        ? buildPartnerCallSlotDateTime(normalizedCallDate, callTimeSlot)
        : null;

    if (!campaignTitle) {
      return NextResponse.json({ error: "campaignTitle is required" }, { status: 400 });
    }
    if (!primaryObjective) {
      return NextResponse.json({ error: "primaryObjective is required" }, { status: 400 });
    }
    if (!isPartnerCampaignPlan(tier)) {
      return NextResponse.json(
        { error: "tier must be LAUNCH_SPRINT, DEEP_DIVE, or CUSTOM" },
        { status: 400 },
      );
    }

    const plan = getPartnerCampaignPlan(tier);
    if (!plan) {
      return NextResponse.json({ error: "Unsupported campaign plan" }, { status: 400 });
    }

    if (!Number.isFinite(prizePoolUsdc) || prizePoolUsdc < plan.minPrizePoolUsdc) {
      return NextResponse.json(
        {
          error: `prizePoolUsdc must be >= ${plan.minPrizePoolUsdc} for ${plan.label}`,
        },
        { status: 400 },
      );
    }
    if (!callBookedFor || Number.isNaN(callBookedFor.getTime())) {
      return NextResponse.json({ error: "callBookedFor is required" }, { status: 400 });
    }
    if (!callTimeSlot) {
      return NextResponse.json({ error: "callTimeSlot is required" }, { status: 400 });
    }
    if (!isValidPartnerCallSlot(callTimeSlot)) {
      return NextResponse.json({ error: "callTimeSlot is invalid" }, { status: 400 });
    }
    if (!callSlotStartAt || Number.isNaN(callSlotStartAt.getTime())) {
      return NextResponse.json({ error: "callTimeSlot is invalid" }, { status: 400 });
    }
    if (callSlotStartAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Select a future strategy call slot" },
        { status: 400 },
      );
    }

    const callBookingWindowEnd = new Date(callBookedFor);
    callBookingWindowEnd.setUTCDate(callBookedFor.getUTCDate() + 1);

    const [conflict] = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "CampaignRequest"
      WHERE
        "callBookedFor" >= ${callBookedFor}
        AND "callBookedFor" < ${callBookingWindowEnd}
        AND "callTimeSlot" = ${callTimeSlot}
        AND "status" IN ('PENDING'::"CampaignRequestStatus", 'APPROVED'::"CampaignRequestStatus")
      LIMIT 1
    `;

    if (conflict) {
      return NextResponse.json(
        { error: "That strategy call slot has already been booked. Choose another slot." },
        { status: 409 },
      );
    }

    const id = randomUUID();
    const now = new Date();

    await prisma.$executeRaw`
      INSERT INTO "CampaignRequest" (
        "id",
        "submittedById",
        "partnerName",
        "partnerNamespace",
        "campaignTitle",
        "primaryObjective",
        "tier",
        "prizePoolUsdc",
        "briefFileName",
        "callBookedFor",
        "callTimeSlot",
        "callTimezone",
        "callBookingNotes",
        "status",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${id},
        ${auth.user.userId},
        ${partnerName},
        ${partnerNamespace},
        ${campaignTitle},
        ${primaryObjective},
        ${tier}::"CampaignTier",
        ${prizePoolUsdc},
        ${briefFileName},
        ${callBookedFor},
        ${callTimeSlot},
        ${callTimezone},
        ${callBookingNotes},
        'PENDING'::"CampaignRequestStatus",
        ${now},
        ${now}
      )
    `;

    const [created] = await prisma.$queryRaw<
      Array<{
        id: string;
        partnerName: string;
        campaignTitle: string;
        tier: string;
        prizePoolUsdc: string;
        callBookedFor: Date | null;
        callTimeSlot: string | null;
        callTimezone: string | null;
        status: string;
        createdAt: Date;
      }>
    >`SELECT "id","partnerName","campaignTitle","tier","prizePoolUsdc","callBookedFor","callTimeSlot","callTimezone","status","createdAt" FROM "CampaignRequest" WHERE "id" = ${id}`;

    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/partner/campaign-requests error", error);
    return NextResponse.json({ error: "Failed to submit campaign request" }, { status: 500 });
  }
}
