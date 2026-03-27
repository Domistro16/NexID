import { PartnerVerificationStatus, PartnerTier } from '@prisma/client';
import prisma from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Partner Verification Service
//
// Strategy: "Protocol partner onboarding must include KYC/entity verification
// (registered company or known on-chain entity). Whitelist of approved partners
// publicly visible."
//
// Verification flow:
//   UNVERIFIED → PENDING_REVIEW → VERIFIED / REJECTED
// ─────────────────────────────────────────────────────────────────────────────

export interface PartnerOnboardingInput {
    orgName: string;
    namespace?: string;
    websiteUrl?: string;
    socialUrl?: string;
    entityType?: string;
    entityRegistration?: string;
    contactEmail?: string;
    description?: string;
}

/**
 * Submit partner profile for verification.
 * Transitions from UNVERIFIED → PENDING_REVIEW.
 */
export async function submitForVerification(
    partnerId: string,
    data: {
        websiteUrl?: string;
        socialUrl?: string;
        entityType?: string;
        entityRegistration?: string;
        contactEmail?: string;
        description?: string;
    },
): Promise<void> {
    const partner = await prisma.partner.findUnique({
        where: { id: partnerId },
        select: { verificationStatus: true },
    });

    if (!partner) throw new Error('Partner not found');

    if (partner.verificationStatus === 'VERIFIED') {
        throw new Error('Partner is already verified');
    }

    // Require minimum fields for review
    if (!data.websiteUrl && !data.socialUrl) {
        throw new Error('At least a website URL or social URL is required for verification');
    }
    if (!data.contactEmail) {
        throw new Error('Contact email is required for verification');
    }

    await prisma.partner.update({
        where: { id: partnerId },
        data: {
            verificationStatus: 'PENDING_REVIEW',
            websiteUrl: data.websiteUrl,
            socialUrl: data.socialUrl,
            entityType: data.entityType,
            entityRegistration: data.entityRegistration,
            contactEmail: data.contactEmail,
            description: data.description,
        },
    });
}

/**
 * Admin: approve a partner's verification.
 */
export async function approvePartner(
    partnerId: string,
    adminUserId: string,
    tier?: PartnerTier,
): Promise<void> {
    await prisma.partner.update({
        where: { id: partnerId },
        data: {
            verificationStatus: 'VERIFIED',
            verifiedAt: new Date(),
            verifiedBy: adminUserId,
            rejectionReason: null,
            isPubliclyVisible: true,
            tier: tier ?? 'STANDARD',
        },
    });
}

/**
 * Admin: reject a partner's verification.
 */
export async function rejectPartner(
    partnerId: string,
    adminUserId: string,
    reason: string,
): Promise<void> {
    await prisma.partner.update({
        where: { id: partnerId },
        data: {
            verificationStatus: 'REJECTED',
            verifiedBy: adminUserId,
            rejectionReason: reason,
            isPubliclyVisible: false,
        },
    });
}

/**
 * Check if a partner is verified (gate for campaign submission).
 */
export async function isPartnerVerified(partnerId: string): Promise<boolean> {
    const partner = await prisma.partner.findUnique({
        where: { id: partnerId },
        select: { verificationStatus: true },
    });
    return partner?.verificationStatus === 'VERIFIED';
}

/**
 * Check if a partner is verified by userId.
 */
export async function isPartnerVerifiedByUserId(
    userId: string,
): Promise<boolean> {
    const partner = await prisma.partner.findUnique({
        where: { userId },
        select: { verificationStatus: true },
    });
    return partner?.verificationStatus === 'VERIFIED';
}

/**
 * Get the public partner directory (verified partners only).
 */
export async function getPublicPartnerDirectory() {
    return prisma.partner.findMany({
        where: {
            isPubliclyVisible: true,
            verificationStatus: 'VERIFIED',
        },
        select: {
            id: true,
            orgName: true,
            namespace: true,
            tier: true,
            websiteUrl: true,
            socialUrl: true,
            description: true,
            verifiedAt: true,
        },
        orderBy: { orgName: 'asc' },
    });
}

/**
 * Admin: list all partners with verification status.
 */
export async function listPartnersForReview(
    statusFilter?: PartnerVerificationStatus,
) {
    return prisma.partner.findMany({
        where: statusFilter ? { verificationStatus: statusFilter } : undefined,
        include: {
            user: { select: { walletAddress: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
}
