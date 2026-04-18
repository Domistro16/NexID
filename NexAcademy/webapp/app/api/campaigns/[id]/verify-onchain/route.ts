import { NextRequest, NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/middleware/admin.middleware";
import {
  verifyOnchainAction,
  verifySignatureAction,
  VerificationError,
  type OnchainConfig,
} from "@/lib/services/onchain-verification.service";
import { calculateOnchainScore } from "@/lib/services/scoring-composition.service";
import { resolveCampaignId } from "@/lib/campaign-route";

/**
 * POST /api/campaigns/[id]/verify-onchain
 *
 * Dual-mode on-chain verification:
 *
 * Transaction mode (default):
 *   Body: { txHash: string }
 *   Verifies the tx on the campaign's primary chain.
 *
 * Signature mode:
 *   Body: { message: string, signature: string }
 *   Verifies the user signed a message with their wallet.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const campaignId = await resolveCampaignId(id);
  if (campaignId === null) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let body: { txHash?: string; message?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    // Load campaign with on-chain config
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        status: true,
        primaryChain: true,
        onchainConfig: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status !== "LIVE" && campaign.status !== "ENDED") {
      return NextResponse.json(
        { error: "Campaign is not active for on-chain verification" },
        { status: 400 },
      );
    }

    // Find participant enrollment
    const participant = await prisma.campaignParticipant.findUnique({
      where: {
        campaignId_userId: {
          campaignId,
          userId: auth.user.userId,
        },
      },
      select: { id: true, onchainScore: true },
    });

    if (!participant) {
      return NextResponse.json(
        { error: "You must be enrolled in this campaign to verify on-chain actions" },
        { status: 403 },
      );
    }

    // Check if already verified
    const existing = await prisma.onchainVerification.findUnique({
      where: {
        campaignId_userId: {
          campaignId,
          userId: auth.user.userId,
        },
      },
    });

    if (existing?.verified) {
      return NextResponse.json(
        { error: "On-chain action already verified for this campaign", verification: existing },
        { status: 409 },
      );
    }

    // Determine verification mode from campaign config
    const onchainConfig = (campaign.onchainConfig as OnchainConfig | null) ?? null;
    const verificationMode = onchainConfig?.verificationMode ?? "transaction";

    // ── Signature Mode ──────────────────────────────────────────────────────
    if (verificationMode === "signature") {
      const message = body.message?.trim();
      const signature = body.signature?.trim();

      if (!message || !signature) {
        return NextResponse.json(
          { error: "Both message and signature are required for signature verification" },
          { status: 400 },
        );
      }

      if (!/^0x[a-fA-F0-9]+$/.test(signature)) {
        return NextResponse.json(
          { error: "signature must be a valid hex string starting with 0x" },
          { status: 400 },
        );
      }

      const result = await verifySignatureAction(
        message,
        signature,
        auth.user.walletAddress,
      );

      if (!result.verified) {
        // Store failed attempt
        await prisma.onchainVerification.upsert({
          where: {
            campaignId_userId: {
              campaignId,
              userId: auth.user.userId,
            },
          },
          create: {
            campaignId,
            userId: auth.user.userId,
            participantId: participant.id,
            verificationMode: "signature",
            signedMessage: message,
            signature,
            chain: campaign.primaryChain,
            verified: false,
            rawData: result.rawData as Prisma.InputJsonValue,
          },
          update: {
            verificationMode: "signature",
            signedMessage: message,
            signature,
            verified: false,
            rawData: result.rawData as Prisma.InputJsonValue,
          },
        });

        return NextResponse.json({
          verified: false,
          reason: result.reason,
          chain: campaign.primaryChain,
        });
      }

      // Signature mode is a binary proof-of-wallet-control — full credit on pass.
      const onchainScore = 100;

      // Store verification + update participant score atomically
      await prisma.$transaction([
        prisma.onchainVerification.upsert({
          where: {
            campaignId_userId: {
              campaignId,
              userId: auth.user.userId,
            },
          },
          create: {
            campaignId,
            userId: auth.user.userId,
            participantId: participant.id,
            verificationMode: "signature",
            signedMessage: message,
            signature,
            chain: campaign.primaryChain,
            verified: true,
            verifiedAt: new Date(),
            rawData: result.rawData as Prisma.InputJsonValue,
          },
          update: {
            verificationMode: "signature",
            signedMessage: message,
            signature,
            verified: true,
            verifiedAt: new Date(),
            rawData: result.rawData as Prisma.InputJsonValue,
          },
        }),
        prisma.campaignParticipant.update({
          where: { id: participant.id },
          data: { onchainScore },
        }),
      ]);

      return NextResponse.json({
        verified: true,
        onchainScore,
        chain: campaign.primaryChain,
        recoveredAddress: result.recoveredAddress,
      });
    }

    // ── Transaction Mode (default) ──────────────────────────────────────────
    const txHash = body.txHash?.trim();
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return NextResponse.json(
        { error: "txHash must be a valid 66-character hex string (0x + 64 hex chars)" },
        { status: 400 },
      );
    }

    const result = await verifyOnchainAction(
      txHash,
      campaign.primaryChain,
      onchainConfig,
      auth.user.walletAddress,
    );

    if (!result.verified) {
      // Store failed attempt for audit but don't update score
      await prisma.onchainVerification.upsert({
        where: {
          campaignId_userId: {
            campaignId,
            userId: auth.user.userId,
          },
        },
        create: {
          campaignId,
          userId: auth.user.userId,
          participantId: participant.id,
          verificationMode: "transaction",
          txHash,
          chain: campaign.primaryChain,
          verified: false,
          rawData: result.rawData as Prisma.InputJsonValue,
        },
        update: {
          txHash,
          verified: false,
          rawData: result.rawData as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json({
        verified: false,
        reason: result.reason,
        txHash,
        chain: campaign.primaryChain,
      });
    }

    // Calculate onchain score
    const onchainScore = calculateOnchainScore({
      actionCompleted: true,
      amountRatio: result.amountRatio,
    });

    // Store verification + update participant score atomically
    await prisma.$transaction([
      prisma.onchainVerification.upsert({
        where: {
          campaignId_userId: {
            campaignId,
            userId: auth.user.userId,
          },
        },
        create: {
          campaignId,
          userId: auth.user.userId,
          participantId: participant.id,
          verificationMode: "transaction",
          txHash,
          chain: campaign.primaryChain,
          verified: true,
          verifiedAt: new Date(),
          amountUsd: result.amountRatio
            ? (onchainConfig?.minAmountUsd ?? 0) * result.amountRatio
            : null,
          rawData: result.rawData as Prisma.InputJsonValue,
        },
        update: {
          txHash,
          verified: true,
          verifiedAt: new Date(),
          amountUsd: result.amountRatio
            ? (onchainConfig?.minAmountUsd ?? 0) * result.amountRatio
            : null,
          rawData: result.rawData as Prisma.InputJsonValue,
        },
      }),
      prisma.campaignParticipant.update({
        where: { id: participant.id },
        data: { onchainScore },
      }),
    ]);

    return NextResponse.json({
      verified: true,
      onchainScore,
      txHash,
      chain: campaign.primaryChain,
      from: result.from,
      to: result.to,
      value: result.value,
      amountRatio: result.amountRatio,
      blockNumber: result.blockNumber.toString(),
    });
  } catch (err) {
    if (err instanceof VerificationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }

    console.error("POST /api/campaigns/[id]/verify-onchain error", err);
    return NextResponse.json(
      { error: "Failed to verify on-chain action" },
      { status: 500 },
    );
  }
}
