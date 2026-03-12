import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { verifyAdmin } from "@/lib/middleware/admin.middleware";

const VALID_TIERS = new Set(["STANDARD", "PREMIUM", "ECOSYSTEM"]);
const VALID_STATUSES = new Set(["DRAFT", "LIVE", "ENDED", "ARCHIVED"]);
const VALID_OWNER_TYPES = new Set(["NEXID", "PARTNER"]);
const VALID_CONTRACT_TYPES = new Set(["NEXID_CAMPAIGNS", "PARTNER_CAMPAIGNS"]);

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
  requestId: string | null;
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
          "id",
          "slug",
          "title",
          "objective",
          "sponsorName",
          "sponsorNamespace",
          "tier",
          "ownerType",
          "contractType",
          "prizePoolUsdc"::text AS "prizePoolUsdc",
          "keyTakeaways",
          "coverImageUrl",
          "modules",
          "status",
          "isPublished",
          "startAt",
          "endAt",
          "escrowAddress",
          "onChainCampaignId",
          "requestId",
          "createdAt",
          "updatedAt"
        FROM "Campaign"
        ${whereClause}
        ORDER BY "createdAt" DESC
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
          "function getCampaign(uint256) view returns (tuple(uint256 id, string title, string description, string category, string level, string thumbnailUrl, string duration, uint256 totalTasks, address sponsor, string sponsorName, string sponsorLogo, uint256 prizePool, uint256 startTime, uint256 endTime, bool isActive))",
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
              onChainStatus: !isActive ? "Inactive" : isEnded ? "Ended" : "Active",
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

    const title = String(body.title || "").trim();
    const objective = String(body.objective || "").trim();
    const sponsorName = String(body.sponsorName || "").trim();
    const sponsorNamespace = body.sponsorNamespace ? String(body.sponsorNamespace).trim() : null;
    const tierRaw = String(body.tier || "").toUpperCase();
    const tier = VALID_TIERS.has(tierRaw) ? tierRaw : "STANDARD";
    const ownerTypeRaw = String(body.ownerType || "PARTNER").toUpperCase();
    const ownerType = VALID_OWNER_TYPES.has(ownerTypeRaw) ? ownerTypeRaw : "PARTNER";
    const fallbackContractType = ownerType === "NEXID" ? "NEXID_CAMPAIGNS" : "PARTNER_CAMPAIGNS";
    const contractTypeRaw = String(body.contractType || fallbackContractType).toUpperCase();
    const contractType = VALID_CONTRACT_TYPES.has(contractTypeRaw)
      ? contractTypeRaw
      : fallbackContractType;
    const prizePoolUsdc = Number(body.prizePoolUsdc);
    const statusRaw = String(body.status || "DRAFT").toUpperCase();
    const status = VALID_STATUSES.has(statusRaw) ? statusRaw : "DRAFT";
    const isPublished =
      typeof body.isPublished === "boolean" ? body.isPublished : status === "LIVE";
    const keyTakeaways = Array.isArray(body.keyTakeaways)
      ? body.keyTakeaways.map((item: unknown) => String(item).trim()).filter(Boolean)
      : [];
    const startAt = parseDate(body.startAt);
    const endAt = parseDate(body.endAt);
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

    const slug = await getUniqueSlug(slugify(title));

    const [created] = await prisma.$queryRaw<
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
        ${startAt},
        ${endAt},
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
      await prisma.$executeRaw`
        UPDATE "Campaign"
        SET "keyTakeaways" = ${keyTakeaways}::text[]
        WHERE "id" = ${created.id}
      `;
    }

    return NextResponse.json({ campaign: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/campaigns error", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
