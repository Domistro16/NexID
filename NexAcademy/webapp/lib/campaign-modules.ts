type UnknownRecord = Record<string, unknown>;

const MODULE_ITEM_TYPES = new Set(["video", "task", "quiz", "locked"]);
const VERIFICATION_TYPES = new Set(["none", "discord-join", "discord-post"]);

export type CampaignModuleItemType = "video" | "task" | "quiz" | "locked";
export type CampaignVerificationType = "none" | "discord-join" | "discord-post";

export type CampaignModuleItem = {
  type: CampaignModuleItemType;
  title: string;
  videoUrl?: string;
  description?: string;
  actionUrl?: string;
  actionLabel?: string;
  verificationType?: CampaignVerificationType;
  guildId?: string;
  channelId?: string;
  question?: string;
  options?: string[];
  correctIndex?: number;
  points?: number;
  durationSeconds?: number;
};

export type CampaignModuleGroup = {
  title: string;
  description?: string;
  items: CampaignModuleItem[];
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const parsed = Math.floor(value);
  return parsed >= 0 ? parsed : undefined;
}

function normalizeModuleItem(raw: unknown, fallbackTitle: string): CampaignModuleItem | null {
  if (!isRecord(raw)) {
    return null;
  }

  const rawType = asTrimmedString(raw.type)?.toLowerCase();
  if (!rawType || !MODULE_ITEM_TYPES.has(rawType)) {
    return null;
  }

  const type = rawType as CampaignModuleItemType;
  const title = asTrimmedString(raw.title) ?? fallbackTitle;

  const item: CampaignModuleItem = {
    type,
    title,
  };

  const videoUrl = asTrimmedString(raw.videoUrl);
  if (videoUrl) {
    item.videoUrl = videoUrl;
  }

  const description = asTrimmedString(raw.description);
  if (description) {
    item.description = description;
  }

  const actionUrl = asTrimmedString(raw.actionUrl);
  if (actionUrl) {
    item.actionUrl = actionUrl;
  }

  const actionLabel = asTrimmedString(raw.actionLabel);
  if (actionLabel) {
    item.actionLabel = actionLabel;
  }

  const verificationType = asTrimmedString(raw.verificationType)?.toLowerCase();
  if (verificationType && VERIFICATION_TYPES.has(verificationType)) {
    item.verificationType = verificationType as CampaignVerificationType;
  }

  const guildId = asTrimmedString(raw.guildId);
  if (guildId) {
    item.guildId = guildId;
  }

  const channelId = asTrimmedString(raw.channelId);
  if (channelId) {
    item.channelId = channelId;
  }

  const question = asTrimmedString(raw.question);
  if (question) {
    item.question = question;
  }

  if (Array.isArray(raw.options)) {
    item.options = raw.options.map((option) => String(option));
  }

  const correctIndex = asNonNegativeInteger(raw.correctIndex);
  if (correctIndex !== undefined) {
    item.correctIndex = correctIndex;
  }

  const points = typeof raw.points === "number" && Number.isFinite(raw.points)
    ? Math.max(0, Math.floor(raw.points))
    : undefined;
  if (points !== undefined) {
    item.points = points;
  }

  const durationSeconds = typeof raw.durationSeconds === "number" && Number.isFinite(raw.durationSeconds)
    ? Math.max(0, Math.floor(raw.durationSeconds))
    : undefined;
  if (durationSeconds !== undefined) {
    item.durationSeconds = durationSeconds;
  }

  return item;
}

function parseGroupedModules(raw: unknown): CampaignModuleGroup[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const groups: CampaignModuleGroup[] = [];
  for (const groupValue of raw) {
    if (!isRecord(groupValue)) {
      continue;
    }
    if (!Array.isArray(groupValue.items)) {
      continue;
    }

    const items: CampaignModuleItem[] = [];
    for (let index = 0; index < groupValue.items.length; index += 1) {
      const normalizedItem = normalizeModuleItem(groupValue.items[index], `Item ${index + 1}`);
      if (normalizedItem) {
        items.push(normalizedItem);
      }
    }
    if (items.length === 0) {
      continue;
    }

    const title = asTrimmedString(groupValue.title) ?? `Module ${groups.length + 1}`;
    const description = asTrimmedString(groupValue.description);
    const group: CampaignModuleGroup = { title, items };
    if (description) {
      group.description = description;
    }
    groups.push(group);
  }

  return groups;
}

function parseLegacyItems(raw: unknown): CampaignModuleItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const items: CampaignModuleItem[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const normalizedItem = normalizeModuleItem(raw[index], `Item ${index + 1}`);
    if (normalizedItem) {
      items.push(normalizedItem);
    }
  }
  return items;
}

function groupLegacyItems(items: CampaignModuleItem[]): {
  groups: CampaignModuleGroup[];
  legacyToGroup: number[];
} {
  const allItemsAreVideo = items.length > 0 && items.every((item) => item.type === "video");
  if (allItemsAreVideo) {
    return {
      groups: [
        {
          title: "Module 1",
          items: [...items],
        },
      ],
      legacyToGroup: items.map(() => 0),
    };
  }

  const groups: CampaignModuleGroup[] = [];
  const legacyToGroup: number[] = [];
  let currentGroup: CampaignModuleGroup | null = null;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const shouldStartNewGroup =
      !currentGroup || ((item.type === "video" || item.type === "locked") && currentGroup.items.length > 0);

    if (shouldStartNewGroup) {
      currentGroup = {
        title: `Module ${groups.length + 1}`,
        items: [],
      };
      groups.push(currentGroup);
    }

    if (!currentGroup) {
      continue;
    }
    currentGroup.items.push(item);
    legacyToGroup[index] = groups.length - 1;
  }

  return { groups, legacyToGroup };
}

export function campaignModulesAreGrouped(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) {
    return false;
  }

  return raw.every((groupValue) => isRecord(groupValue) && Array.isArray(groupValue.items));
}

export function normalizeCampaignModules(raw: unknown): CampaignModuleGroup[] {
  const grouped = parseGroupedModules(raw);
  if (grouped.length > 0) {
    return grouped;
  }

  const legacyItems = parseLegacyItems(raw);
  if (legacyItems.length === 0) {
    return [];
  }

  return groupLegacyItems(legacyItems).groups;
}

export function flattenCampaignModuleItems(raw: unknown): CampaignModuleItem[] {
  const grouped = parseGroupedModules(raw);
  if (grouped.length > 0) {
    return grouped.flatMap((group) => group.items);
  }

  return parseLegacyItems(raw);
}

export function buildPartnerModuleGroupsFromItems(items: CampaignModuleItem[]): CampaignModuleGroup[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const normalizedItems: CampaignModuleItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const normalizedItem = normalizeModuleItem(items[index], `Item ${index + 1}`);
    if (normalizedItem) {
      normalizedItems.push(normalizedItem);
    }
  }

  if (normalizedItems.length === 0) {
    return [];
  }

  return groupLegacyItems(normalizedItems).groups;
}

export function getCampaignModuleCount(raw: unknown): number {
  return normalizeCampaignModules(raw).length;
}

export function normalizeCompletedUntil(rawModules: unknown, completedUntil: number): number {
  if (!Number.isInteger(completedUntil) || completedUntil < 0) {
    return -1;
  }

  const moduleCount = getCampaignModuleCount(rawModules);
  if (moduleCount === 0) {
    return -1;
  }

  if (campaignModulesAreGrouped(rawModules)) {
    return Math.min(completedUntil, moduleCount - 1);
  }

  const legacyItems = parseLegacyItems(rawModules);
  if (legacyItems.length === 0) {
    return Math.min(completedUntil, moduleCount - 1);
  }

  const { legacyToGroup } = groupLegacyItems(legacyItems);
  if (legacyToGroup.length === 0) {
    return -1;
  }

  const clampedLegacyIndex = Math.min(completedUntil, legacyToGroup.length - 1);
  const mappedGroupIndex = legacyToGroup[clampedLegacyIndex] ?? -1;
  return Math.max(-1, Math.min(mappedGroupIndex, moduleCount - 1));
}
