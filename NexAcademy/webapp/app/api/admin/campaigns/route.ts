import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";
import {
  isPartnerCampaignPlan,
  resolvePartnerCampaignSchedule,
  type PartnerCampaignSchedule,
} from "@/lib/partner-campaign-plans";
import { validateCampaignIntake } from "@/lib/services/campaign-intake.service";

const VALID_STATUSES = new Set(["DRAFT", "LIVE", "ENDED", "ARCHIVED"]);
const VALID_OWNER_TYPES = new Set(["NEXID", "PARTNER"]);
const VALID_CONTRACT_TYPES = new Set(["NEXID_CAMPAIGNS", "PARTNER_CAMPAIGNS"]);

function usesPartnerCampaignPlan(input: {
  ownerType: string;
  contractType: string;
}) {
  return input.ownerType === "PARTNER" && input.contractType === "PARTNER_CAMPAIGNS";
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || `campaign-${Date.now()}`;
}

async function getUniqueSlug(base: string): Promise<string> {
  let slug = base;
  let suffix = 2;

  while (true) {
    const [row] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
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

type CampaignRow = {
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
  rewardSchedule: unknown;
  primaryChain: string;
  onchainConfig: unknown;
  requestId: string | null;
  requestStatus?: string | null;
  requestCampaignTitle?: string | null;
  requestPartnerName?: string | null;
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
      ? Prisma.sql`WHERE "status" = ${statusFilter}::"CampaignStatus"`
      : Prisma.empty;

    const campaigns = await prisma.$queryRaw<CampaignRow[]>(
      Prisma.sql`
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
        ${whereClause}
        ORDER BY c."createdAt" DESC
      `,
    );

    const campaignIds = campaigns.map((c) => c.id);
    let metricsMap = new Map<number, { participantCount: number; topScore: number; totalScore: number }>();

    if (campaignIds.length > 0) {
      const metrics = await prisma.$queryRaw<
        Array<{ campaignId: number; participantCount: number; topScore: number; totalScore: number }>
      >(
        Prisma.sql`
          SELECT
            "campaignId",
            COUNT(*)::int AS "participantCount",
            COALESCE(MAX("score"), 0)::int AS "topScore",
            COALESCE(SUM("score"), 0)::int AS "totalScore"
          FROM "CampaignParticipant"
          WHERE "campaignId" IN (${Prisma.join(campaignIds)})
          GROUP BY "campaignId"
        `,
      );

      metricsMap = new Map(
        metrics.map((m) => [m.campaignId, { participantCount: m.participantCount, topScore: m.topScore, totalScore: m.totalScore }]),
      );
    }

    // Enrich with on-chain status from PartnerCampaigns (source of truth)
    let onChainStatusMap = new Map<number, { onChainStatus: string; onChainEndTime: number | null }>();
    const partnerAddr = process.env.PARTNER_CAMPAIGNS_ADDRESS || process.env.NEXT_PUBLIC_PARTNER_CAMPAIGNS_ADDRESS;
    const rpcUrl = process.env.RPC_URL || "https://mainnet.base.org";

    if (partnerAddr) {
      try {
        const { ethers } = await import("ethers");
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const abi = [
          "function getCampaign(uint256) view returns (tuple(uint256 id, string title, string description, string category, string level, string thumbnailUrl, uint256 totalTasks, address sponsor, string sponsorName, string sponsorLogo, uint256 prizePool, uint256 startTime, uint256 endTime, uint256 durationDays, uint256 winnerCap, uint256 payoutRounds, uint256 payoutIntervalDays, uint8 plan, uint8 leaderboardMode, bool isActive))",
        ];
        const contract = new ethers.Contract(partnerAddr, abi, provider);

        const withOnChainId = campaigns.filter((c) => c.onChainCampaignId != null);
        const results = await Promise.allSettled(
          withOnChainId.map((c) => contract.getCampaign(c.onChainCampaignId)),
        );

        const now = Math.floor(Date.now() / 1000);
        for (let i = 0; i < withOnChainId.length; i++) {
          const result = results[i];
          if (result.status === "fulfilled") {
            const campaign = result.value;
            const isActive = campaign.isActive;
            const endTime = Number(campaign.endTime);
            const isEnded = endTime > 0 && now >= endTime;

            onChainStatusMap.set(withOnChainId[i].id, {
              onChainStatus: isEnded ? "Ended" : !isActive ? "Inactive" : "Active",
              onChainEndTime: endTime || null,
            });
          }
        }
      } catch (err) {
        console.error("Failed to read on-chain status, falling back to DB:", err);
      }
    }

    return NextResponse.json({
      campaigns: campaigns.map((c) => ({
        ...c,
        ...(metricsMap.get(c.id) ?? { participantCount: 0, topScore: 0, totalScore: 0 }),
        ...(onChainStatusMap.get(c.id) ?? {}),
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/campaigns error", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();

    const requestId =
      body.requestId && String(body.requestId).trim()
        ? String(body.requestId).trim()
        : null;
    const requestReviewNotes =
      body.requestReviewNotes && String(body.requestReviewNotes).trim()
        ? String(body.requestReviewNotes).trim()
        : null;
    const titleInput = String(body.title || "").trim();
    const objectiveInput = String(body.objective || "").trim();
    const sponsorNameInput = String(body.sponsorName || "").trim();
    const sponsorNamespaceInput = body.sponsorNamespace
      ? String(body.sponsorNamespace).trim()
      : null;
    const tierRaw = String(body.tier || "").toUpperCase();
    const ownerTypeRaw = String(body.ownerType || "PARTNER").toUpperCase();
    const ownerType = VALID_OWNER_TYPES.has(ownerTypeRaw) ? ownerTypeRaw : "PARTNER";
    const fallbackContractType = ownerType === "NEXID" ? "NEXID_CAMPAIGNS" : "PARTNER_CAMPAIGNS";
    const contractTypeRaw = String(body.contractType || fallbackContractType).toUpperCase();
    const contractType = VALID_CONTRACT_TYPES.has(contractTypeRaw)
      ? contractTypeRaw
      : fallbackContractType;
    const prizePoolUsdcInput = Number(body.prizePoolUsdc);
    const customWinnerCap =
      body.customWinnerCap !== undefined && body.customWinnerCap !== null
        ? Number(body.customWinnerCap)
        : null;
    const statusRaw = String(body.status || "DRAFT").toUpperCase();
    const status = VALID_STATUSES.has(statusRaw) ? statusRaw : "DRAFT";
    const isPublished =
      typeof body.isPublished === "boolean" ? body.isPublished : status === "LIVE";
    const keyTakeaways = Array.isArray(body.keyTakeaways)
      ? body.keyTakeaways.map((item: unknown) => String(item).trim()).filter(Boolean)
      : [];
    const linkedRequest = requestId
      ? (
          await prisma.$queryRaw<
            Array<{
              id: string;
              partnerName: string;
              partnerNamespace: string | null;
              campaignTitle: string;
              primaryObjective: string;
              tier: string;
              prizePoolUsdc: string;
              status: string;
            }>
          >`
            SELECT
              "id",
              "partnerName",
              "partnerNamespace",
              "campaignTitle",
              "primaryObjective",
              "tier"::text AS "tier",
              "prizePoolUsdc"::text AS "prizePoolUsdc",
              "status"::text AS "status"
            FROM "CampaignRequest"
            WHERE "id" = ${requestId}
            LIMIT 1
          `
        )[0] ?? null
      : null;

    if (requestId && !linkedRequest) {
      return NextResponse.json({ error: "Campaign request not found" }, { status: 404 });
    }

    if (linkedRequest?.status === "REJECTED") {
      return NextResponse.json(
        { error: "Rejected campaign requests cannot be attached to campaigns" },
        { status: 409 },
      );
    }

    if (requestId) {
      const [existingLinkedCampaign] = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id"
        FROM "Campaign"
        WHERE "requestId" = ${requestId}
        LIMIT 1
      `;

      if (existingLinkedCampaign) {
        return NextResponse.json(
          { error: `Campaign request is already linked to campaign #${existingLinkedCampaign.id}` },
          { status: 409 },
        );
      }
    }

    const title = titleInput || linkedRequest?.campaignTitle || "";
    const objective = objectiveInput || linkedRequest?.primaryObjective || "";
    const sponsorName = sponsorNameInput || linkedRequest?.partnerName || "";
    const sponsorNamespace = sponsorNamespaceInput ?? linkedRequest?.partnerNamespace ?? null;
    const tier = isPartnerCampaignPlan(tierRaw)
      ? tierRaw
      : linkedRequest && isPartnerCampaignPlan(linkedRequest.tier)
        ? linkedRequest.tier
        : "LAUNCH_SPRINT";
    const prizePoolUsdc = Number.isFinite(prizePoolUsdcInput)
      ? prizePoolUsdcInput
      : Number(linkedRequest?.prizePoolUsdc ?? 0);
    const partnerManagedCampaign = usesPartnerCampaignPlan({ ownerType, contractType });
    let schedule: PartnerCampaignSchedule | null = null;
    if (partnerManagedCampaign) {
      try {
        schedule = resolvePartnerCampaignSchedule({
          planId: tier,
          prizePoolUsdc,
          startAt: parseDate(body.startAt),
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
    const primaryChain = body.primaryChain ? String(body.primaryChain).trim() : "base";
    const onchainConfig = body.onchainConfig && typeof body.onchainConfig === "object"
      ? body.onchainConfig
      : null;
    const coverImageUrl = body.coverImageUrl ? String(body.coverImageUrl).trim() : null;
    const modules = Array.isArray(body.modules) ? body.modules : [];

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!objective) {
      return NextResponse.json({ error: "objective is required" }, { status: 400 });
    }
    if (!sponsorName) {
      return NextResponse.json({ error: "sponsorName is required" }, { status: 400 });
    }
    if (!Number.isFinite(prizePoolUsdc) || prizePoolUsdc < 0) {
      return NextResponse.json({ error: "prizePoolUsdc must be >= 0" }, { status: 400 });
    }

    // Campaign intake validation when going LIVE
    if (status === "LIVE" && partnerManagedCampaign) {
      const intake = validateCampaignIntake({
        modules,
        prizePoolUsdc,
        tier,
      });
      if (!intake.valid) {
        return NextResponse.json(
          { error: "Campaign does not meet minimum requirements", details: intake.errors, warnings: intake.warnings },
          { status: 400 },
        );
      }
    }

    const slug = await getUniqueSlug(slugify(title));

    const created = await prisma.$transaction(async (tx) => {
      const [campaign] = await tx.$queryRaw<
        Array<{
          id: number;
          slug: string;
          title: string;
          status: string;
          prizePoolUsdc: string;
          isPublished: boolean;
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
          "coverImageUrl",
          "modules",
          "status",
          "isPublished",
          "startAt",
          "endAt",
          "rewardSchedule",
          "primaryChain",
          "onchainConfig",
          "requestId",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${slug},
          ${title},
          ${objective},
          ${sponsorName},
          ${sponsorNamespace},
          ${tier}::"CampaignTier",
          ${ownerType}::"CampaignOwnerType",
          ${contractType}::"CampaignContractType",
          ${prizePoolUsdc},
          ${coverImageUrl},
          ${JSON.stringify(modules)}::jsonb,
          ${status}::"CampaignStatus",
          ${isPublished},
          ${schedule?.startAt ?? parseDate(body.startAt)},
          ${schedule?.endAt ?? parseDate(body.endAt)},
          ${schedule ? JSON.stringify(schedule) : null}::jsonb,
          ${primaryChain},
          ${onchainConfig ? JSON.stringify(onchainConfig) : null}::jsonb,
          ${requestId},
          ${new Date()},
          ${new Date()}
        )
        RETURNING
          "id",
          "slug",
          "title",
          "status",
          "isPublished",
          "prizePoolUsdc"::text AS "prizePoolUsdc"
      `;

      if (keyTakeaways.length > 0) {
        await tx.$executeRaw`
          UPDATE "Campaign"
          SET "keyTakeaways" = ${keyTakeaways}::text[]
          WHERE "id" = ${campaign.id}
        `;
      }

      if (requestId) {
        await tx.$executeRaw`
          UPDATE "CampaignRequest"
          SET
            "status" = 'APPROVED'::"CampaignRequestStatus",
            "reviewNotes" = COALESCE(${requestReviewNotes}, "reviewNotes"),
            "reviewedById" = COALESCE(${auth.user?.userId ?? null}, "reviewedById"),
            "updatedAt" = ${new Date()}
          WHERE "id" = ${requestId}
        `;
      }

      return campaign;
    });

    return NextResponse.json({ campaign: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/campaigns error", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
