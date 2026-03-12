import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";

const MIN_PRIZE_POOL_USDC = 15000;
const VALID_TIERS = new Set(["STANDARD", "PREMIUM", "ECOSYSTEM"]);

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
    const callBookedFor = callBookedForRaw ? new Date(callBookedForRaw) : null;

    if (!campaignTitle) {
      return NextResponse.json({ error: "campaignTitle is required" }, { status: 400 });
    }
    if (!primaryObjective) {
      return NextResponse.json({ error: "primaryObjective is required" }, { status: 400 });
    }
    if (!VALID_TIERS.has(tier)) {
      return NextResponse.json({ error: "tier must be STANDARD, PREMIUM, or ECOSYSTEM" }, { status: 400 });
    }
    if (!Number.isFinite(prizePoolUsdc) || prizePoolUsdc < MIN_PRIZE_POOL_USDC) {
      return NextResponse.json(
        { error: `prizePoolUsdc must be >= ${MIN_PRIZE_POOL_USDC}` },
        { status: 400 },
      );
    }
    if (!callBookedFor || Number.isNaN(callBookedFor.getTime())) {
      return NextResponse.json({ error: "callBookedFor is required" }, { status: 400 });
    }
    if (!callTimeSlot) {
      return NextResponse.json({ error: "callTimeSlot is required" }, { status: 400 });
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
