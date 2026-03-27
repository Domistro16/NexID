import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/middleware/admin.middleware';
import { verifyEscrowFunds } from '@/lib/services/campaign-intake.service';

/**
 * POST /api/admin/campaigns/[id]/verify-escrow
 * Verify that escrow funds are deposited for a campaign.
 * Checks the on-chain USDC balance of the escrow address.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const admin = await verifyAdmin(request);
    if (!admin.authorized) {
        return NextResponse.json({ error: admin.error }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
        return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 });
    }

    const result = await verifyEscrowFunds(campaignId);
    return NextResponse.json(result);
}
