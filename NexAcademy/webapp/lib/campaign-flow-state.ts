export const CAMPAIGN_FLOW_STAGES = [
  "INTRO",
  "MODULE_VIDEO",
  "MODULE_TASK",
  "MODULE_QUIZ",
  "QUIZ_ASSESSMENT",
  "PROOF_OF_ADVOCACY",
  "LIVE_AI_PREP",
  "LIVE_AI_ASSESSMENT",
  "RESULTS",
] as const;

export type CampaignFlowStage = (typeof CAMPAIGN_FLOW_STAGES)[number];

export interface CampaignFlowStateSnapshot {
  hasStartedFlow: boolean;
  activeStage: CampaignFlowStage;
  activeModuleIndex: number;
  activeItemIndex: number;
  completedGroupIndexes: number[];
  viewedItemKeys: string[];
  quizCorrectKeys: string[];
  quizAnswers: Record<string, number>;
  videoUnlockAtByItem: Record<string, number>;
}

export const DEFAULT_CAMPAIGN_FLOW_STATE: CampaignFlowStateSnapshot = {
  hasStartedFlow: false,
  activeStage: "INTRO",
  activeModuleIndex: 0,
  activeItemIndex: 0,
  completedGroupIndexes: [],
  viewedItemKeys: [],
  quizCorrectKeys: [],
  quizAnswers: {},
  videoUnlockAtByItem: {},
};

function isFlowStage(value: unknown): value is CampaignFlowStage {
  return typeof value === "string" && CAMPAIGN_FLOW_STAGES.includes(value as CampaignFlowStage);
}

function toNonNegativeInt(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
    ),
  );
}

function sanitizeIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
        .map((entry) => Math.max(0, Math.floor(entry))),
    ),
  ).sort((a, b) => a - b);
}

function sanitizeNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value).filter(
    ([key, recordValue]) =>
      key.length > 0 && typeof recordValue === "number" && Number.isFinite(recordValue),
  );

  return Object.fromEntries(entries);
}

export function normalizeCampaignFlowState(raw: unknown): CampaignFlowStateSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_CAMPAIGN_FLOW_STATE };
  }

  const state = raw as Partial<CampaignFlowStateSnapshot>;

  return {
    hasStartedFlow: Boolean(state.hasStartedFlow),
    activeStage: isFlowStage(state.activeStage) ? state.activeStage : DEFAULT_CAMPAIGN_FLOW_STATE.activeStage,
    activeModuleIndex: toNonNegativeInt(state.activeModuleIndex, 0),
    activeItemIndex: toNonNegativeInt(state.activeItemIndex, 0),
    completedGroupIndexes: sanitizeIntegerArray(state.completedGroupIndexes),
    viewedItemKeys: sanitizeStringArray(state.viewedItemKeys),
    quizCorrectKeys: sanitizeStringArray(state.quizCorrectKeys),
    quizAnswers: sanitizeNumberRecord(state.quizAnswers),
    videoUnlockAtByItem: sanitizeNumberRecord(state.videoUnlockAtByItem),
  };
}

export function buildSequentialCompletedGroupIndexes(lastCompletedGroupIndex: number) {
  if (!Number.isInteger(lastCompletedGroupIndex) || lastCompletedGroupIndex < 0) {
    return [];
  }

  return Array.from({ length: lastCompletedGroupIndex + 1 }, (_, index) => index);
}
