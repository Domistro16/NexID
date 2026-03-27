import { NextResponse } from 'next/server';
import { getPublicProofOfOutcome } from '@/lib/services/proof-of-outcome.service';

/**
 * GET /api/proof-of-outcome
 *
 * Public Proof of Outcome dashboard — platform-wide aggregate stats.
 * No authentication required. This is the sales tool.
 *
 * Data points:
 * - Platform bot removal rate
 * - Average comprehension score
 * - On-chain action success rate
 * - Score distribution histogram
 * - User quality segments (anonymised)
 * - Total rewards distributed
 * - Platform benchmarks
 */
export async function GET() {
    try {
        const data = await getPublicProofOfOutcome();
        return NextResponse.json(data);
    } catch (error) {
        console.error('[ProofOfOutcome] Public dashboard error:', error);
        return NextResponse.json(
            { error: 'Failed to generate proof of outcome' },
            { status: 500 },
        );
    }
}
