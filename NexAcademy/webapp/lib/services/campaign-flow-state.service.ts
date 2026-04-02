import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  CAMPAIGN_FLOW_STAGES,
  DEFAULT_CAMPAIGN_FLOW_STATE,
  type CampaignFlowStage,
  type CampaignFlowStateSnapshot,
  normalizeCampaignFlowState,
} from "@/lib/campaign-flow-state";

type FlowStateRow = {
  id: string;
  flowStage: string | null;
  flowState: Prisma.JsonValue | null;
};

async function getParticipantRow(campaignId: number, userId: string) {
  const rows = await prisma.$queryRaw<FlowStateRow[]>`
    SELECT
      "id",
      "flowStage",
      "flowState"
    FROM "CampaignParticipant"
    WHERE "campaignId" = ${campaignId} AND "userId" = ${userId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getCampaignFlowState(
  campaignId: number,
  userId: string,
): Promise<CampaignFlowStateSnapshot> {
  const participant = await getParticipantRow(campaignId, userId);
  if (!participant) {
    throw new Error("Not enrolled in this campaign");
  }

  const normalized = normalizeCampaignFlowState(participant.flowState);
  if (
    participant.flowStage &&
    CAMPAIGN_FLOW_STAGES.includes(participant.flowStage as CampaignFlowStage) &&
    participant.flowStage !== normalized.activeStage
  ) {
    return {
      ...normalized,
      activeStage: participant.flowStage as CampaignFlowStateSnapshot["activeStage"],
    };
  }

  return normalized;
}

export async function saveCampaignFlowState(
  campaignId: number,
  userId: string,
  rawState: unknown,
): Promise<CampaignFlowStateSnapshot> {
  const participant = await getParticipantRow(campaignId, userId);
  if (!participant) {
    throw new Error("Not enrolled in this campaign");
  }

  const normalized = normalizeCampaignFlowState(rawState);
  const payload = JSON.stringify(normalized);

  await prisma.$executeRaw`
    UPDATE "CampaignParticipant"
    SET
      "flowStage" = ${normalized.activeStage},
      "flowState" = CAST(${payload} AS jsonb),
      "flowStartedAt" = CASE
        WHEN ${normalized.hasStartedFlow} THEN COALESCE("flowStartedAt", NOW())
        ELSE NULL
      END,
      "updatedAt" = NOW()
    WHERE "id" = ${participant.id}
  `;

  return normalized;
}

export function getDefaultCampaignFlowState() {
  return { ...DEFAULT_CAMPAIGN_FLOW_STATE };
}
