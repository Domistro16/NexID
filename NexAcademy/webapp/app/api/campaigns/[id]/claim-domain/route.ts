import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";

const MAX_CLAIMS = 1000;
const MIN_DOMAIN_LENGTH = 5;
const MAX_DOMAIN_LENGTH = 63;

/**
 * GET /api/campaigns/[id]/claim-domain
 * Check if the current user has already claimed a domain for this campaign,
 * and return the total claims count.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const campaignId = parseInt(id, 10);

        if (!Number.isFinite(campaignId)) {
            return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
        }

        const auth = await verifyAuth(req);
        if (!auth.authorized || !auth.user) {
            return NextResponse.json({ error: auth.error }, { status: 401 });
        }
        const userId = auth.user.userId;

        const totalClaims = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM "DomainClaim" WHERE "campaignId" = ${campaignId}
        `;
        const claimedCount = Number(totalClaims[0]?.count ?? 0);

        const existing = await prisma.$queryRaw<{ id: string; domainName: string }[]>`
            SELECT "id", "domainName" FROM "DomainClaim" WHERE "campaignId" = ${campaignId} AND "userId" = ${userId} LIMIT 1
        `;

        return NextResponse.json({
            claimed: existing.length > 0,
            domainName: existing[0]?.domainName ?? null,
            claimedCount,
            maxClaims: MAX_CLAIMS,
            spotsRemaining: Math.max(0, MAX_CLAIMS - claimedCount),
        });
    } catch (error) {
        console.error("GET /api/campaigns/[id]/claim-domain error", error);
        return NextResponse.json({ error: "Failed to fetch domain claim status" }, { status: 500 });
    }
}

/**
 * POST /api/campaigns/[id]/claim-domain
 * Claim a domain name for this campaign.
 * Requirements: user must have completed the campaign, must be first 1000.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const campaignId = parseInt(id, 10);

        if (!Number.isFinite(campaignId)) {
            return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
        }

        const auth = await verifyAuth(req);
        if (!auth.authorized || !auth.user) {
            return NextResponse.json({ error: auth.error }, { status: 401 });
        }
        const userId = auth.user.userId;

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid request body. Please submit valid JSON." },
                { status: 400 },
            );
        }

        const domainName =
            body && typeof body === "object"
                ? "domainName" in body
                    ? String(body.domainName ?? "").trim().toLowerCase()
                    : "domain" in body
                        ? String(body.domain ?? "").trim().toLowerCase()
                        : ""
                : "";

        if (domainName.length < MIN_DOMAIN_LENGTH) {
            return NextResponse.json(
                { error: `Domain name must be at least ${MIN_DOMAIN_LENGTH} characters` },
                { status: 400 },
            );
        }
        if (domainName.length > MAX_DOMAIN_LENGTH) {
            return NextResponse.json(
                { error: `Domain name must be no more than ${MAX_DOMAIN_LENGTH} characters` },
                { status: 400 },
            );
        }
        if (!/^[a-z0-9]+$/.test(domainName)) {
            return NextResponse.json(
                { error: "Domain name must contain only letters and numbers" },
                { status: 400 },
            );
        }

        const participant = await prisma.$queryRaw<{ completedAt: Date | null }[]>`
            SELECT "completedAt" FROM "CampaignParticipant" WHERE "campaignId" = ${campaignId} AND "userId" = ${userId} LIMIT 1
        `;

        if (!participant[0]?.completedAt) {
            return NextResponse.json(
                { error: "You must complete the course before claiming a domain" },
                { status: 403 },
            );
        }

        const existing = await prisma.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "DomainClaim" WHERE "campaignId" = ${campaignId} AND "userId" = ${userId} LIMIT 1
        `;
        if (existing.length > 0) {
            return NextResponse.json(
                { error: "You have already claimed a domain for this course" },
                { status: 400 },
            );
        }

        const totalClaims = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM "DomainClaim" WHERE "campaignId" = ${campaignId}
        `;
        if (Number(totalClaims[0]?.count ?? 0) >= MAX_CLAIMS) {
            return NextResponse.json(
                { error: `All ${MAX_CLAIMS} domain spots have been claimed` },
                { status: 400 },
            );
        }

        const domainTaken = await prisma.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "DomainClaim" WHERE "domainName" = ${domainName} LIMIT 1
        `;
        if (domainTaken.length > 0) {
            return NextResponse.json(
                { error: `"${domainName}" is already taken. Please choose another name.` },
                { status: 409 },
            );
        }

        const claimId = crypto.randomUUID();
        const walletAddress = auth.user.walletAddress;
        await prisma.$executeRaw`
            INSERT INTO "DomainClaim" ("id", "campaignId", "userId", "walletAddress", "domainName", "claimedAt")
            VALUES (${claimId}, ${campaignId}, ${userId}, ${walletAddress}, ${domainName}, NOW())
        `;

        return NextResponse.json({
            success: true,
            domainName,
            message: `You have claimed "${domainName}.id"!`,
        });
    } catch (error) {
        console.error("POST /api/campaigns/[id]/claim-domain error", error);
        return NextResponse.json({ error: "Failed to claim domain" }, { status: 500 });
    }
}
