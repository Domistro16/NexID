export type PartnerCallSlotDefinition = {
  id: string;
  label: string;
  hour: number;
  minute: number;
  durationMinutes: number;
};

export const PARTNER_CALL_SLOT_DEFINITIONS: PartnerCallSlotDefinition[] = [
  { id: "10:00", label: "10:00 UTC", hour: 10, minute: 0, durationMinutes: 45 },
  { id: "11:30", label: "11:30 UTC", hour: 11, minute: 30, durationMinutes: 45 },
  { id: "14:00", label: "14:00 UTC", hour: 14, minute: 0, durationMinutes: 45 },
  { id: "16:30", label: "16:30 UTC", hour: 16, minute: 30, durationMinutes: 45 },
];

const PARTNER_CALL_SLOT_ID_SET = new Set(
  PARTNER_CALL_SLOT_DEFINITIONS.map((slot) => slot.id),
);

export const DEFAULT_PARTNER_CALL_SLOT_DAYS = 14;

export function isValidPartnerCallSlot(slotId: string): boolean {
  return PARTNER_CALL_SLOT_ID_SET.has(slotId);
}

export function getPartnerCallSlot(slotId: string): PartnerCallSlotDefinition | null {
  return PARTNER_CALL_SLOT_DEFINITIONS.find((slot) => slot.id === slotId) ?? null;
}

export function normalizePartnerCallDate(input: string | Date): string | null {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return input.toISOString().slice(0, 10);
  }

  const value = String(input || "").trim();
  if (!value) return null;

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const normalized = `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`;
    const date = new Date(`${normalized}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : normalized;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function toPartnerCallDate(value: string): Date | null {
  const normalized = normalizePartnerCallDate(value);
  return normalized ? new Date(`${normalized}T00:00:00.000Z`) : null;
}

export function buildPartnerCallSlotDateTime(
  dateIso: string,
  slotId: string,
): Date | null {
  const normalizedDate = normalizePartnerCallDate(dateIso);
  const slot = getPartnerCallSlot(slotId);

  if (!normalizedDate || !slot) return null;

  const [year, month, day] = normalizedDate.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day, slot.hour, slot.minute, 0, 0),
  );
}

export function buildPartnerCallSlotCalendar(
  startDateIso: string,
  days: number,
  bookedSlotKeys: Set<string>,
) {
  const startDate = toPartnerCallDate(startDateIso);
  if (!startDate) return [];

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(startDate);
    day.setUTCDate(startDate.getUTCDate() + index);

    const date = day.toISOString().slice(0, 10);

    return {
      date,
      slots: PARTNER_CALL_SLOT_DEFINITIONS.map((slot) => {
        const startAt = buildPartnerCallSlotDateTime(date, slot.id);
        const endAt = startAt
          ? new Date(startAt.getTime() + slot.durationMinutes * 60 * 1000)
          : null;
        const key = `${date}:${slot.id}`;

        return {
          id: slot.id,
          label: slot.label,
          startAt: startAt?.toISOString() ?? null,
          endAt: endAt?.toISOString() ?? null,
          available: !bookedSlotKeys.has(key),
        };
      }),
    };
  });
}
