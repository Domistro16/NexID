/* ── Campaign Admin Types ── */

export type CampaignSection =
  | "campaigns"
  | "requests"
  | "builder"
  | "quiz"
  | "users"
  | "bots"
  | "settings";

export interface CampaignRow {
  id: number;
  slug: string;
  title: string;
  objective: string;
  sponsorName: string;
  sponsorNamespace: string | null;
  tier: string;
  ownerType: string;
  contractType: string;
  prizePoolUsdc: string;
  keyTakeaways: string[];
  coverImageUrl: string | null;
  modules: unknown;
  status: string;
  isPublished: boolean;
  startAt: string | null;
  endAt: string | null;
  escrowAddress: string | null;
  escrowId: number | null;
  onChainCampaignId: number | null;
  rewardSchedule: unknown;
  requestId: string | null;
  requestStatus?: string | null;
  requestCampaignTitle?: string | null;
  requestPartnerName?: string | null;
  createdAt: string;
  updatedAt: string;
  participantCount: number;
  topScore: number;
  totalScore: number;
  onChainStatus?: string;
  onChainEndTime?: number | null;
}

export interface CampaignRequestRow {
  id: string;
  partnerName: string;
  partnerNamespace: string | null;
  campaignTitle: string;
  primaryObjective: string;
  tier: string;
  prizePoolUsdc: string;
  briefFileName: string | null;
  callBookedFor: string | null;
  callTimeSlot: string | null;
  callTimezone: string | null;
  callBookingNotes: string | null;
  status: string;
  reviewNotes: string | null;
  linkedCampaignId: number | null;
  linkedCampaignSlug: string | null;
  linkedCampaignTitle: string | null;
  linkedCampaignStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionRow {
  id: string;
  campaignId: number;
  type: "MCQ" | "FREE_TEXT";
  questionText: string;
  variants: unknown;
  options: string[] | null;
  correctIndex: number | null;
  gradingRubric: string | null;
  points: number;
  difficulty: number;
  tags: string[];
  isSpeedTrap: boolean;
  speedTrapWindow: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionPoolStats {
  total: number;
  active: number;
  mcq: number;
  freeText: number;
  speedTraps: number;
}
