import prisma from "@/lib/prisma";

const DEFAULT_DELIVERY_BATCH_SIZE = 25;
const DEFAULT_RELEVANCE_TRIGGER_URL = "https://api-f1db6c.stack.tryrelevance.com/latest/agents/trigger";

function getRelevanceApiKey() {
  return process.env.RELEVANCE_AI_API_KEY;
}

function getRelevanceTriggerUrl() {
  return process.env.RELEVANCE_AI_TRIGGER_URL || DEFAULT_RELEVANCE_TRIGGER_URL;
}

function getDefaultRelevanceAgentId() {
  return process.env.RELEVANCE_AI_DEFAULT_AGENT_ID;
}

function formatAgentPrompt(event: {
  type: string;
  title: string;
  message: string;
  domainName: string | null;
  walletAddress: string;
  previousScore: number | null;
  currentScore: number | null;
  evidence: unknown;
}) {
  return [
    "NexID identity notification event",
    "",
    `Type: ${event.type}`,
    `Title: ${event.title}`,
    `Message: ${event.message}`,
    `Identity: ${event.domainName ?? event.walletAddress}`,
    event.previousScore !== null ? `Previous score: ${event.previousScore}` : null,
    event.currentScore !== null ? `Current score: ${event.currentScore}` : null,
    "",
    "Use this deterministic NexID event as the source of truth. Explain the change clearly and route the notification through the configured Relevance AI workflow.",
    "",
    `Evidence JSON: ${JSON.stringify(event.evidence)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function triggerRelevanceAgent(input: {
  agentId: string;
  content: string;
}) {
  const apiKey = getRelevanceApiKey();
  if (!apiKey) throw new Error("RELEVANCE_AI_API_KEY is not configured");

  const response = await fetch(getRelevanceTriggerUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({
      message: {
        role: "user",
        content: input.content,
      },
      agent_id: input.agentId,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    throw new Error(body?.error ?? body?.message ?? `Relevance AI trigger failed with ${response.status}`);
  }

  return body;
}

export async function runRelevanceNotificationDelivery(batchSize = DEFAULT_DELIVERY_BATCH_SIZE) {
  if (!getRelevanceApiKey()) {
    throw new Error("RELEVANCE_AI_API_KEY is not configured");
  }

  const events = await prisma.identityNotificationEvent.findMany({
    where: {
      channel: "RELEVANCE_AI",
      status: { in: ["PENDING", "QUEUED", "FAILED"] },
      profile: {
        isEnabled: true,
        relevanceAgentStatus: "LINKED",
      },
    },
    include: {
      profile: {
        select: {
          relevanceAgentId: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(batchSize, 1), 100),
  });

  let triggered = 0;
  let failed = 0;

  for (const event of events) {
    const agentId = event.profile?.relevanceAgentId ?? getDefaultRelevanceAgentId();

    await prisma.identityNotificationEvent.update({
      where: { id: event.id },
      data: {
        status: "QUEUED",
        queuedAt: event.queuedAt ?? new Date(),
        error: null,
      },
    });

    try {
      if (!agentId) {
        throw new Error("No profile relevanceAgentId or RELEVANCE_AI_DEFAULT_AGENT_ID configured");
      }

      await triggerRelevanceAgent({
        agentId,
        content: formatAgentPrompt(event),
      });

      await prisma.identityNotificationEvent.update({
        where: { id: event.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          error: null,
        },
      });
      triggered += 1;
    } catch (error: any) {
      await prisma.identityNotificationEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          error: error?.message ?? String(error),
        },
      });
      failed += 1;
    }
  }

  return {
    attempted: events.length,
    triggered,
    failed,
  };
}
