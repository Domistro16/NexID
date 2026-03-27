import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';

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
 * GET /api/admin/contract-whitelist
 *
 * List all whitelisted contracts. Supports ?approved=true|false filter.
 */
export async function GET(request: NextRequest) {
    const adminResult = await verifyAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    const url = new URL(request.url);
    const approvedFilter = url.searchParams.get('approved');

    const where: Record<string, unknown> = {};
    if (approvedFilter === 'true') where.isApproved = true;
    if (approvedFilter === 'false') where.isApproved = false;

    const contracts = await prisma.partnerContractWhitelist.findMany({
        where,
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ contracts });
}

/**
 * POST /api/admin/contract-whitelist
 *
 * Add a new contract to the whitelist.
 * Body: { chainId, contractAddress, actionType, label?, partnerId?, campaignId?, isApproved? }
 */
export async function POST(request: NextRequest) {
    const adminResult = await verifyAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    const body = await request.json();
    const { chainId, contractAddress, actionType, label, partnerId, campaignId, isApproved } = body;

    // Validate required fields
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

    // Check for duplicate
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
            { error: 'This contract is already whitelisted for this chain' },
            { status: 409 },
        );
    }

    const contract = await prisma.partnerContractWhitelist.create({
        data: {
            chainId,
            contractAddress: contractAddress.toLowerCase(),
            actionType,
            label: label ?? null,
            partnerId: partnerId ?? null,
            campaignId: campaignId ? parseInt(campaignId, 10) : null,
            isApproved: isApproved ?? false,
        },
    });

    return NextResponse.json({ contract }, { status: 201 });
}

/**
 * PATCH /api/admin/contract-whitelist
 *
 * Update a whitelisted contract (approve/reject, change action type, etc.)
 * Body: { id, isApproved?, actionType?, label? }
 */
export async function PATCH(request: NextRequest) {
    const adminResult = await verifyAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
        return NextResponse.json(
            { error: 'id is required' },
            { status: 400 },
        );
    }

    if (updates.actionType && !VALID_ACTION_TYPES.has(updates.actionType)) {
        return NextResponse.json(
            {
                error: `actionType must be one of: ${Array.from(VALID_ACTION_TYPES).join(', ')}`,
            },
            { status: 400 },
        );
    }

    const data: Record<string, unknown> = {};
    if (typeof updates.isApproved === 'boolean') data.isApproved = updates.isApproved;
    if (updates.actionType) data.actionType = updates.actionType;
    if (typeof updates.label === 'string') data.label = updates.label;

    const contract = await prisma.partnerContractWhitelist.update({
        where: { id },
        data,
    });

    return NextResponse.json({ contract });
}

/**
 * DELETE /api/admin/contract-whitelist
 *
 * Remove a contract from the whitelist.
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
    const adminResult = await verifyAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    const body = await request.json();
    const { id } = body;

    if (!id) {
        return NextResponse.json(
            { error: 'id is required' },
            { status: 400 },
        );
    }

    await prisma.partnerContractWhitelist.delete({
        where: { id },
    });

    return NextResponse.json({ deleted: true });
}
