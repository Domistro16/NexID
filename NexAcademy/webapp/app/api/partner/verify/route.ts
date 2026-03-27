import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/middleware/admin.middleware';
import { submitForVerification } from '@/lib/services/partner-verification.service';

/**
 * POST /api/partner/verify
 * Submit partner profile for KYC/entity verification.
 *
 * Body: { websiteUrl?, socialUrl?, entityType?, entityRegistration?, contactEmail, description? }
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
        return NextResponse.json(
            { error: 'Partner profile not found. Complete onboarding first.' },
            { status: 403 },
        );
    }

    const body = await request.json();

    try {
        await submitForVerification(partner.id, {
            websiteUrl: body.websiteUrl,
            socialUrl: body.socialUrl,
            entityType: body.entityType,
            entityRegistration: body.entityRegistration,
            contactEmail: body.contactEmail,
            description: body.description,
        });
        return NextResponse.json({ success: true, status: 'PENDING_REVIEW' });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Verification submission failed';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
