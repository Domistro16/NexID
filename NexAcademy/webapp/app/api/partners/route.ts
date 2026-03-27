import { NextResponse } from 'next/server';
import { getPublicPartnerDirectory } from '@/lib/services/partner-verification.service';

/**
 * GET /api/partners
 *
 * Public partner directory — lists all verified partners.
 * No authentication required. Strategy: "Whitelist of approved partners
 * publicly visible."
 */
export async function GET() {
    try {
        const partners = await getPublicPartnerDirectory();
        return NextResponse.json({ partners });
    } catch (error) {
        console.error('[Partners] Directory error:', error);
        return NextResponse.json(
            { error: 'Failed to load partner directory' },
            { status: 500 },
        );
    }
}
