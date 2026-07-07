import prisma from "@/lib/prisma";

const DEFAULT_REPUTATION_DROP_THRESHOLD = 10;
const DEFAULT_INACTIVITY_DAYS_THRESHOLD = 21;
const RECENT_EVENT_WINDOW_HOURS = 24;

type PassportSnapshotInput = {
  userId: string;
  walletAddress: string;
  frequencyScore: number;
  recencyScore: number;
  depthScore: number;
  varietyScore: number;
  volumeTier: number;
  compositeScore: number;
  consecutiveActiveWeeks: number;
  crossProtocolCount: number;
  activeDays: number;
  txCount: number;
  source?: string;
};

type NotificationProfile = Awaited<ReturnType<typeof findNotificationProfile>>;

function normalizeWalletAddress(walletAddress: string) {
  return walletAddress.trim().toLowerCase();
}

function recentEventThreshold() {
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - RECENT_EVENT_WINDOW_HOURS);
  return threshold;
}

function chooseChannel(profile: NonNullable<NotificationProfile>) {
  if (profile.telegramChatId) return "TELEGRAM" as const;
  if (
    profile.relevanceAgentStatus === "LINKED" &&
    (profile.relevanceAgentId || process.env.RELEVANCE_AI_DEFAULT_AGENT_ID)
  ) {
    return "RELEVANCE_AI" as const;
  }
  if (profile.email) return "EMAIL" as const;
  return "IN_APP" as const;
}

async function findNotificationProfile(userId: string, walletAddress: string) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);

  return prisma.identityNotificationProfile.findFirst({
    where: {
      userId,
      isEnabled: true,
      OR: [
        { primaryWalletAddress: normalizedWallet },
        { linkedWalletAddresses: { has: normalizedWallet } },
      ],
    },
    orderBy: [{ domainName: "asc" }, { createdAt: "asc" }],
  });
}

async function hasRecentEvent(params: {
  userId: string;
  walletAddress: string;
  type: "REPUTATION_DROP" | "INACTIVITY";
}) {
  const existing = await prisma.identityNotificationEvent.findFirst({
    where: {
      userId: params.userId,
      walletAddress: normalizeWalletAddress(params.walletAddress),
      type: params.type,
      status: { not: "DISMISSED" },
      createdAt: { gte: recentEventThreshold() },
    },
    select: { id: true },
  });

  return Boolean(existing);
}

async function queueNotificationEvent(params: {
  input: PassportSnapshotInput;
  profile: NotificationProfile;
  type: "REPUTATION_DROP" | "INACTIVITY";
  title: string;
  message: string;
  previousScore?: number;
}) {
  if (
    await hasRecentEvent({
      userId: params.input.userId,
      walletAddress: params.input.walletAddress,
      type: params.type,
    })
  ) {
    return null;
  }

  const profile = params.profile;
  const channel = profile ? chooseChannel(profile) : "IN_APP";

  return prisma.identityNotificationEvent.create({
    data: {
      userId: params.input.userId,
      profileId: profile?.id,
      type: params.type,
      channel,
      status: "PENDING",
      domainName: profile?.domainName ?? null,
      walletAddress: normalizeWalletAddress(params.input.walletAddress),
      title: params.title,
      message: params.message,
      previousScore: params.previousScore,
      currentScore: params.input.compositeScore,
      evidence: {
        source: params.input.source ?? "NEXID_PASSPORT_SCAN",
        activeDays: params.input.activeDays,
        txCount: params.input.txCount,
        frequencyScore: params.input.frequencyScore,
        recencyScore: params.input.recencyScore,
        depthScore: params.input.depthScore,
        varietyScore: params.input.varietyScore,
        volumeTier: params.input.volumeTier,
        consecutiveActiveWeeks: params.input.consecutiveActiveWeeks,
        crossProtocolCount: params.input.crossProtocolCount,
      },
    },
  });
}

export async function recordPassportSnapshotAndQueueAlerts(input: PassportSnapshotInput) {
  const walletAddress = normalizeWalletAddress(input.walletAddress);

  const [previousSnapshot, profile] = await Promise.all([
    prisma.passportScoreSnapshot.findFirst({
      where: { userId: input.userId, walletAddress },
      orderBy: { createdAt: "desc" },
    }),
    findNotificationProfile(input.userId, walletAddress),
  ]);

  const snapshot = await prisma.passportScoreSnapshot.create({
    data: {
      userId: input.userId,
      walletAddress,
      source: input.source ?? "NEXID_PASSPORT_SCAN",
      frequencyScore: input.frequencyScore,
      recencyScore: input.recencyScore,
      depthScore: input.depthScore,
      varietyScore: input.varietyScore,
      volumeTier: input.volumeTier,
      compositeScore: input.compositeScore,
      consecutiveActiveWeeks: input.consecutiveActiveWeeks,
      crossProtocolCount: input.crossProtocolCount,
      activeDays: input.activeDays,
      txCount: input.txCount,
    },
  });

  const events = [];
  const dropThreshold =
    profile?.reputationDropThreshold ?? DEFAULT_REPUTATION_DROP_THRESHOLD;
  const inactivityThreshold =
    profile?.inactivityDaysThreshold ?? DEFAULT_INACTIVITY_DAYS_THRESHOLD;

  if (previousSnapshot) {
    const scoreDrop = previousSnapshot.compositeScore - input.compositeScore;
    if (scoreDrop >= dropThreshold) {
      const event = await queueNotificationEvent({
        input: { ...input, walletAddress },
        profile,
        type: "REPUTATION_DROP",
        title: "Your .id reputation dropped",
        message: `Your .id reputation dropped from ${previousSnapshot.compositeScore} to ${input.compositeScore}. NexID detected weaker recent on-chain activity for this identity.`,
        previousScore: previousSnapshot.compositeScore,
      });
      if (event) events.push(event);
    }

    const wentInactive =
      input.activeDays === 0 &&
      previousSnapshot.activeDays > 0 &&
      inactivityThreshold <= 30;

    if (wentInactive) {
      const event = await queueNotificationEvent({
        input: { ...input, walletAddress },
        profile,
        type: "INACTIVITY",
        title: "Your .id activity went quiet",
        message: `NexID has not seen whitelisted on-chain activity for this identity in the latest scan window. A quick partner interaction can help restore your activity signal.`,
        previousScore: previousSnapshot.compositeScore,
      });
      if (event) events.push(event);
    }
  }

  return {
    snapshotId: snapshot.id,
    eventsQueued: events.length,
  };
}
