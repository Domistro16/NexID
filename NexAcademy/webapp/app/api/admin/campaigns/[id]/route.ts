import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import {
  isPartnerCampaignPlan,
  resolvePartnerCampaignSchedule,
} from "@/lib/partner-campaign-plans";
import { readQuizModeFromModules } from "@/lib/services/campaign-assessment-config.service";
import { hasStructuredFreeTextGradingProvider } from "@/lib/services/quiz-grading.service";

const VALID_STATUSES = new Set(["DRAFT", "LIVE", "ENDED", "ARCHIVED"]);
const VALID_OWNER_TYPES = new Set(["NEXID", "PARTNER"]);
const VALID_CONTRACT_TYPES = new Set(["NEXID_CAMPAIGNS", "PARTNER_CAMPAIGNS"]);

function usesPartnerCampaignPlan(input: {
  ownerType: string | null;
  contractType: string | null;
}) {
  return input.ownerType === "PARTNER" && input.contractType === "PARTNER_CAMPAIGNS";
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  try {
    const [campaign] = await prisma.$queryRaw<
      Array<{
        id: number;
        slug: string;
        title: string;
        objective: string;
        sponsorName: string;
        sponsorNamespace: string | null;
        tier: string;
        ownerType: string;
        contractType: string;
        prizePoolUsdc: string;
        keyTakeaways: string[];
        coverImageUrl: string | null;
        modules: unknown;
        status: string;
        isPublished: boolean;
        startAt: Date | null;
        endAt: Date | null;
        escrowAddress: string | null;
        escrowId: number | null;
        onChainCampaignId: number | null;
        partnerContractAddress: string | null;
        rewardSchedule: unknown;
        primaryChain: string;
        onchainConfig: unknown;
        requestId: string | null;
        requestStatus: string | null;
        requestCampaignTitle: string | null;
        requestPartnerName: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT
        c."id",
        c."slug",
        c."title",
        c."objective",
        c."sponsorName",
        c."sponsorNamespace",
        c."tier",
        c."ownerType",
        c."contractType",
        c."prizePoolUsdc"::text AS "prizePoolUsdc",
        c."keyTakeaways",
        c."coverImageUrl",
        c."modules",
        c."status",
        c."isPublished",
        c."startAt",
        c."endAt",
        c."escrowAddress",
        c."escrowId",
        c."onChainCampaignId",
        c."partnerContractAddress",
        c."rewardSchedule",
        c."primaryChain",
        c."onchainConfig",
        c."requestId",
        r."status"::text AS "requestStatus",
        r."campaignTitle" AS "requestCampaignTitle",
        r."partnerName" AS "requestPartnerName",
        c."createdAt",
        c."updatedAt"
      FROM "Campaign" c
      LEFT JOIN "CampaignRequest" r ON r."id" = c."requestId"
      WHERE c."id" = ${campaignId}
      LIMIT 1
    `;

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("GET /api/admin/campaigns/[id] error", error);
    return NextResponse.json({ error: "Failed to fetch campaign" }, { status: 500 });
  }
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
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  try {
    const body = await request.json();

    const title = body.title ? String(body.title).trim() : null;
    const objective = body.objective ? String(body.objective).trim() : null;
    const sponsorName = body.sponsorName ? String(body.sponsorName).trim() : null;
    const sponsorNamespace = body.sponsorNamespace
      ? String(body.sponsorNamespace).trim()
      : null;
    const tierInput = body.tier ? String(body.tier).toUpperCase() : null;
    const tier = tierInput && isPartnerCampaignPlan(tierInput) ? tierInput : null;
    const ownerTypeInput = body.ownerType ? String(body.ownerType).toUpperCase() : null;
    const ownerType = ownerTypeInput && VALID_OWNER_TYPES.has(ownerTypeInput) ? ownerTypeInput : null;
    const contractTypeInput = body.contractType ? String(body.contractType).toUpperCase() : null;
    const contractType = contractTypeInput && VALID_CONTRACT_TYPES.has(contractTypeInput)
      ? contractTypeInput
      : null;
    const statusInput = body.status ? String(body.status).toUpperCase() : null;
    const status = statusInput && VALID_STATUSES.has(statusInput) ? statusInput : null;
    const prizePoolUsdc =
      body.prizePoolUsdc !== undefined && body.prizePoolUsdc !== null
        ? Number(body.prizePoolUsdc)
        : null;
    const customWinnerCap =
      body.customWinnerCap !== undefined && body.customWinnerCap !== null
        ? Number(body.customWinnerCap)
        : null;
    const isPublished =
      typeof body.isPublished === "boolean"
        ? body.isPublished
        : status === "LIVE"
          ? true
          : status === "DRAFT"
            ? false
            : null;
    const startAt = body.startAt !== undefined ? parseDate(body.startAt) : undefined;
    const endAt = body.endAt !== undefined ? parseDate(body.endAt) : undefined;
    const keyTakeaways = Array.isArray(body.keyTakeaways)
      ? body.keyTakeaways.map((item: unknown) => String(item).trim()).filter(Boolean)
      : undefined;
    const coverImageUrl = body.coverImageUrl !== undefined
      ? (body.coverImageUrl ? String(body.coverImageUrl).trim() : null)
      : undefined;
    const modules = Array.isArray(body.modules) ? body.modules : undefined;
    const requestedQuizMode = modules ? readQuizModeFromModules(modules) : null;
    const primaryChain = body.primaryChain ? String(body.primaryChain).trim() : undefined;
    const onchainConfig = body.onchainConfig !== undefined
      ? (body.onchainConfig && typeof body.onchainConfig === "object" ? body.onchainConfig : null)
      : undefined;
    const requestIdInput = body.requestId;
    const requestId =
      requestIdInput === undefined
        ? undefined
        : requestIdInput && String(requestIdInput).trim()
          ? String(requestIdInput).trim()
          : null;
    const onChainCampaignId =
      body.onChainCampaignId !== undefined && body.onChainCampaignId !== null
        ? Number(body.onChainCampaignId)
        : null;
    const escrowId =
      body.escrowId !== undefined && body.escrowId !== null
        ? Number(body.escrowId)
        : null;
    const escrowAddress =
      body.escrowAddress !== undefined && body.escrowAddress !== null
        ? String(body.escrowAddress).trim()
        : null;
    const partnerManagedCampaign = usesPartnerCampaignPlan({ ownerType, contractType });
    let schedule = null;
    if (partnerManagedCampaign && tier && prizePoolUsdc !== null) {
      try {
        schedule = resolvePartnerCampaignSchedule({
          planId: tier,
          prizePoolUsdc,
          startAt: startAt === undefined ? undefined : startAt,
          customWinnerCap,
        });
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error ? error.message : "Invalid campaign plan settings",
          },
          { status: 400 },
        );
      }
    }

    if (requestId !== undefined && requestId !== null) {
      const [requestRow] = await prisma.$queryRaw<
        Array<{ id: string; status: string }>
      >`
        SELECT "id", "status"::text AS "status"
        FROM "CampaignRequest"
        WHERE "id" = ${requestId}
        LIMIT 1
      `;

      if (!requestRow) {
        return NextResponse.json({ error: "Campaign request not found" }, { status: 404 });
      }

      if (requestRow.status === "REJECTED") {
        return NextResponse.json(
          { error: "Rejected campaign requests cannot be attached to campaigns" },
          { status: 409 },
        );
      }

      const [linkedCampaign] = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id"
        FROM "Campaign"
        WHERE "requestId" = ${requestId}
          AND "id" <> ${campaignId}
        LIMIT 1
      `;

      if (linkedCampaign) {
        return NextResponse.json(
          { error: `Campaign request is already linked to campaign #${linkedCampaign.id}` },
          { status: 409 },
        );
      }
    }

    if (requestedQuizMode === "FREE_TEXT" && !hasStructuredFreeTextGradingProvider()) {
      return NextResponse.json(
        { error: "FREE_TEXT structured quiz mode requires OPENAI_API_KEY or ANTHROPIC_API_KEY" },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "Campaign"
        SET
          "title" = COALESCE(${title}, "title"),
          "objective" = COALESCE(${objective}, "objective"),
          "sponsorName" = COALESCE(${sponsorName}, "sponsorName"),
          "sponsorNamespace" = COALESCE(${sponsorNamespace}, "sponsorNamespace"),
          "tier" = COALESCE(${tier}::"CampaignTier", "tier"),
          "ownerType" = COALESCE(${ownerType}::"CampaignOwnerType", "ownerType"),
          "contractType" = COALESCE(${contractType}::"CampaignContractType", "contractType"),
          "prizePoolUsdc" = COALESCE(${prizePoolUsdc}, "prizePoolUsdc"),
          "coverImageUrl" = COALESCE(${coverImageUrl === undefined ? null : coverImageUrl}, "coverImageUrl"),
          "status" = COALESCE(${status}::"CampaignStatus", "status"),
          "isPublished" = COALESCE(${isPublished}, "isPublished"),
          "startAt" = COALESCE(${schedule ? schedule.startAt : startAt === undefined ? null : startAt}, "startAt"),
          "endAt" = COALESCE(${schedule ? schedule.endAt : endAt === undefined ? null : endAt}, "endAt"),
          "onChainCampaignId" = COALESCE(${onChainCampaignId}, "onChainCampaignId"),
          "escrowId" = COALESCE(${escrowId}, "escrowId"),
          "escrowAddress" = COALESCE(${escrowAddress}, "escrowAddress"),
          "rewardSchedule" = CASE
            WHEN ${ownerType}::"CampaignOwnerType" = 'NEXID'::"CampaignOwnerType" THEN NULL
            ELSE COALESCE(${schedule ? JSON.stringify(schedule) : null}::jsonb, "rewardSchedule")
          END,
          "primaryChain" = COALESCE(${primaryChain ?? null}, "primaryChain"),
          "onchainConfig" = COALESCE(${onchainConfig !== undefined && onchainConfig !== null ? JSON.stringify(onchainConfig) : null}::jsonb, "onchainConfig"),
          "updatedAt" = ${new Date()}
        WHERE "id" = ${campaignId}
      `;

      if (keyTakeaways !== undefined) {
        await tx.$executeRaw`
          UPDATE "Campaign"
          SET "keyTakeaways" = ${keyTakeaways}::text[]
          WHERE "id" = ${campaignId}
        `;
      }

      if (modules !== undefined) {
        await tx.$executeRaw`
          UPDATE "Campaign"
          SET "modules" = ${JSON.stringify(modules)}::jsonb
          WHERE "id" = ${campaignId}
        `;
      }

      if (requestId !== undefined) {
        await tx.$executeRaw`
          UPDATE "Campaign"
          SET "requestId" = ${requestId}
          WHERE "id" = ${campaignId}
        `;

        if (requestId) {
          await tx.$executeRaw`
            UPDATE "CampaignRequest"
            SET
              "status" = 'APPROVED'::"CampaignRequestStatus",
              "reviewedById" = COALESCE(${auth.user?.userId ?? null}, "reviewedById"),
              "updatedAt" = ${new Date()}
            WHERE "id" = ${requestId}
          `;
        }
      }
    });

    const [updated] = await prisma.$queryRaw<
      Array<{
        id: number;
        slug: string;
        title: string;
        status: string;
        isPublished: boolean;
        prizePoolUsdc: string;
      }>
    >`
      SELECT
        "id",
        "slug",
        "title",
        "status",
        "isPublished",
        "prizePoolUsdc"::text AS "prizePoolUsdc"
      FROM "Campaign"
      WHERE "id" = ${campaignId}
      LIMIT 1
    `;

    if (!updated) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign: updated });
  } catch (error) {
    console.error("PATCH /api/admin/campaigns/[id] error", error);
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}
