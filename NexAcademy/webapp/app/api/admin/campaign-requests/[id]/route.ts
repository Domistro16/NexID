import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import {
  isPartnerCampaignPlan,
  resolvePartnerCampaignSchedule,
} from "@/lib/partner-campaign-plans";

const VALID_DECISIONS = new Set(["APPROVE", "REJECT"]);
const VALID_CAMPAIGN_STATUS = new Set(["DRAFT", "LIVE", "ENDED", "ARCHIVED"]);
const VALID_OWNER_TYPES = new Set(["NEXID", "PARTNER"]);
const VALID_CONTRACT_TYPES = new Set(["NEXID_CAMPAIGNS", "PARTNER_CAMPAIGNS"]);

type CampaignRequestRow = {
  id: string;
  partnerName: string;
  partnerNamespace: string | null;
  campaignTitle: string;
  primaryObjective: string;
  tier: string;
  prizePoolUsdc: string;
  callBookedFor: Date | null;
  callTimeSlot: string | null;
  callTimezone: string | null;
  callBookingNotes: string | null;
  status: string;
};

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || `campaign-${Date.now()}`;
}

async function getUniqueSlug(tx: Prisma.TransactionClient, base: string): Promise<string> {
  let slug = base;
  let suffix = 2;

  while (true) {
    const [row] = await tx.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM "Campaign" WHERE "slug" = ${slug}) AS "exists"
    `;
    if (!row?.exists) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const decision = String(body.decision || "").toUpperCase();

    if (!VALID_DECISIONS.has(decision)) {
      return NextResponse.json(
        { error: "decision must be APPROVE or REJECT" },
        { status: 400 },
      );
    }

    const reviewNotes =
      body.reviewNotes && String(body.reviewNotes).trim()
        ? String(body.reviewNotes).trim()
        : null;

    const createCampaign = decision === "APPROVE" ? body.createCampaign !== false : false;
    const statusInput = body.campaignStatus
      ? String(body.campaignStatus).toUpperCase()
      : "DRAFT";
    const campaignStatus = VALID_CAMPAIGN_STATUS.has(statusInput) ? statusInput : "DRAFT";
    const ownerTypeInput = body.ownerType
      ? String(body.ownerType).toUpperCase()
      : "PARTNER";
    const ownerType = VALID_OWNER_TYPES.has(ownerTypeInput) ? ownerTypeInput : "PARTNER";
    const fallbackContractType =
      ownerType === "NEXID" ? "NEXID_CAMPAIGNS" : "PARTNER_CAMPAIGNS";
    const contractTypeInput = body.contractType
      ? String(body.contractType).toUpperCase()
      : fallbackContractType;
    const contractType = VALID_CONTRACT_TYPES.has(contractTypeInput)
      ? contractTypeInput
      : fallbackContractType;
    const isPublished =
      typeof body.isPublished === "boolean"
        ? body.isPublished
        : campaignStatus === "LIVE";
    const startAt = parseDate(body.startAt);
    const customWinnerCap =
      body.customWinnerCap !== undefined && body.customWinnerCap !== null
        ? Number(body.customWinnerCap)
        : null;
    const keyTakeaways = Array.isArray(body.keyTakeaways)
      ? body.keyTakeaways.map((item: unknown) => String(item).trim()).filter(Boolean)
      : [];

    const result = await prisma.$transaction(async (tx) => {
      const [existing] = await tx.$queryRaw<CampaignRequestRow[]>`
        SELECT
          "id",
          "partnerName",
          "partnerNamespace",
          "campaignTitle",
          "primaryObjective",
          "tier",
          "prizePoolUsdc"::text AS "prizePoolUsdc",
          "callBookedFor",
          "callTimeSlot",
          "callTimezone",
          "callBookingNotes",
          "status"
        FROM "CampaignRequest"
        WHERE "id" = ${id}
        LIMIT 1
      `;

      if (!existing) {
        return { type: "not_found" as const };
      }

      if (existing.status !== "PENDING") {
        return { type: "invalid_state" as const, status: existing.status };
      }

      await tx.$executeRaw`
        UPDATE "CampaignRequest"
        SET
          "status" = ${decision === "APPROVE" ? "APPROVED" : "REJECTED"}::"CampaignRequestStatus",
          "reviewNotes" = ${reviewNotes},
          "reviewedById" = ${auth.user!.userId},
          "updatedAt" = ${new Date()}
        WHERE "id" = ${id}
      `;

      if (!createCampaign) {
        return { type: "updated_only" as const };
      }

      const tier = isPartnerCampaignPlan(existing.tier)
        ? existing.tier
        : "LAUNCH_SPRINT";
      let schedule;
      try {
        schedule = resolvePartnerCampaignSchedule({
          planId: tier,
          prizePoolUsdc: Number(existing.prizePoolUsdc),
          startAt,
          customWinnerCap,
        });
      } catch (error) {
        return {
          type: "invalid_plan" as const,
          message:
            error instanceof Error ? error.message : "Invalid campaign plan settings",
        };
      }
      const baseSlug = slugify(existing.campaignTitle);
      const slug = await getUniqueSlug(tx, baseSlug);

      const [campaign] = await tx.$queryRaw<
        Array<{
          id: number;
          slug: string;
          title: string;
          objective: string;
          sponsorName: string;
          tier: string;
          ownerType: string;
          contractType: string;
          status: string;
          prizePoolUsdc: string;
          isPublished: boolean;
          startAt: Date | null;
          endAt: Date | null;
          rewardSchedule: unknown;
        }>
      >`
        INSERT INTO "Campaign" (
          "slug",
          "title",
          "objective",
          "sponsorName",
          "sponsorNamespace",
          "tier",
          "ownerType",
          "contractType",
          "prizePoolUsdc",
          "status",
          "isPublished",
          "startAt",
          "endAt",
          "rewardSchedule",
          "requestId",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${slug},
          ${existing.campaignTitle},
          ${existing.primaryObjective},
          ${existing.partnerName},
          ${existing.partnerNamespace},
          ${tier}::"CampaignTier",
          ${ownerType}::"CampaignOwnerType",
          ${contractType}::"CampaignContractType",
          ${Number(existing.prizePoolUsdc)},
          ${campaignStatus}::"CampaignStatus",
          ${isPublished},
          ${schedule.startAt},
          ${schedule.endAt},
          ${JSON.stringify(schedule)}::jsonb,
          ${existing.id},
          ${new Date()},
          ${new Date()}
        )
        RETURNING
          "id",
          "slug",
          "title",
          "objective",
          "sponsorName",
          "tier"::text AS "tier",
          "ownerType"::text AS "ownerType",
          "contractType"::text AS "contractType",
          "status",
          "isPublished",
          "prizePoolUsdc"::text AS "prizePoolUsdc",
          "startAt",
          "endAt",
          "rewardSchedule"
      `;

      if (keyTakeaways.length > 0) {
        await tx.$executeRaw`
          UPDATE "Campaign"
          SET "keyTakeaways" = ${keyTakeaways}::text[]
          WHERE "id" = ${campaign.id}
        `;
      }

      return { type: "approved_with_campaign" as const, campaign };
    });

    if (result.type === "not_found") {
      return NextResponse.json({ error: "Campaign request not found" }, { status: 404 });
    }

    if (result.type === "invalid_state") {
      return NextResponse.json(
        { error: `Campaign request is already ${result.status}` },
        { status: 409 },
      );
    }

    if (result.type === "updated_only") {
      return NextResponse.json({ success: true, campaign: null, createdCampaign: null });
    }

    if (result.type === "invalid_plan") {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      campaign: result.campaign,
      createdCampaign: result.campaign,
    });
  } catch (error) {
    console.error("PATCH /api/admin/campaign-requests/[id] error", error);
    return NextResponse.json({ error: "Failed to review campaign request" }, { status: 500 });
  }
}
