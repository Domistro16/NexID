import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/middleware/admin.middleware';

const VALID_ACTION_TYPES = new Set([
    'LP',
    'SWAP',
    'GOVERNANCE',
    'STAKE',
    'MINT',
    'BRIDGE',
    'OTHER',
]);

/**
 * GET /api/partner/contract-whitelist
 *
 * List contracts submitted by the authenticated partner.
 */
export async function GET(request: NextRequest) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const partner = await prisma.partner.findUnique({
        where: { userId: auth.user.userId },
    });
    if (!partner) {
        return NextResponse.json({ error: 'Not a partner' }, { status: 403 });
    }

    const contracts = await prisma.partnerContractWhitelist.findMany({
        where: { partnerId: partner.id },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ contracts });
}

/**
 * POST /api/partner/contract-whitelist
 *
 * Submit a contract address for whitelist approval.
 * Body: { chainId, contractAddress, actionType, label?, campaignId? }
 *
 * Contracts start as isApproved=false and must be approved by an admin.
 */
export async function POST(request: NextRequest) {
    const auth = await verifyAuth(request);
    if (!auth.authorized || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const partner = await prisma.partner.findUnique({
        where: { userId: auth.user.userId },
    });
    if (!partner) {
        return NextResponse.json({ error: 'Not a partner' }, { status: 403 });
    }

    const body = await request.json();
    const { chainId, contractAddress, actionType, label, campaignId } = body;

    if (typeof chainId !== 'number') {
        return NextResponse.json(
            { error: 'chainId is required and must be a number' },
            { status: 400 },
        );
    }

    if (!contractAddress || typeof contractAddress !== 'string') {
        return NextResponse.json(
            { error: 'contractAddress is required' },
            { status: 400 },
        );
    }

    if (!VALID_ACTION_TYPES.has(actionType)) {
        return NextResponse.json(
            {
                error: `actionType must be one of: ${Array.from(VALID_ACTION_TYPES).join(', ')}`,
            },
            { status: 400 },
        );
    }

    // Check duplicate
    const existing = await prisma.partnerContractWhitelist.findUnique({
        where: {
            chainId_contractAddress: {
                chainId,
                contractAddress: contractAddress.toLowerCase(),
            },
        },
    });

    if (existing) {
        return NextResponse.json(
            { error: 'This contract is already submitted for this chain' },
            { status: 409 },
        );
    }

    const contract = await prisma.partnerContractWhitelist.create({
        data: {
            partnerId: partner.id,
            chainId,
            contractAddress: contractAddress.toLowerCase(),
            actionType,
            label: label ?? null,
            campaignId: campaignId ? parseInt(campaignId, 10) : null,
            isApproved: false, // Always pending admin approval
        },
    });

    return NextResponse.json({ contract }, { status: 201 });
}
