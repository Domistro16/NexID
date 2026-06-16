export type ReviewerView = "desk" | "queue" | "case" | "earnings" | "history" | "how";
export type ReviewerOutcome = "ride" | "fade" | "invalid";
export type ConfidenceLabel = "High" | "Medium" | "Low";

export type EvidenceItem = {
  title: string;
  body: string;
  meta: string;
  url: string | null;
  outcome: ReviewerOutcome | null;
  createdAt: string | null;
};

export type ReviewerCase = {
  id: string;
  assignmentId: string;
  panelId: string;
  title: string;
  category: string;
  status: string;
  assignmentStatus: string;
  panelStatus: string;
  priority: string;
  reward: string;
  pool: number;
  deadline: string;
  deadlineSeconds: number;
  progress: number;
  source: string;
  url: string;
  question: string;
  ride: string;
  fade: string;
  invalid: string;
  fallback: string;
  proposal: string;
  challenge: string;
  challengerEvidence: boolean;
  history: string;
  evidence: EvidenceItem[];
  flags: string[];
  noteHash: string | null;
  noteText: string | null;
  noteNonce: string | null;
  recommendedOutcome: ReviewerOutcome | null;
  confidence: number | null;
  confidenceLabel: ConfidenceLabel | null;
  submittedAt: string | null;
  revealedAt: string | null;
  canCommit: boolean;
  canReveal: boolean;
  finalOutcome: ReviewerOutcome | null;
  receiptHash: string | null;
  receiptStatus: string | null;
};

export type EarningsPoint = {
  x: string;
  y: number;
  cases: number;
  status: string;
};

export type EarningsDetail = {
  title: string;
  amount: string;
  body: string;
  rows: Array<[string, string, string]>;
};

export type HistoryRow = {
  marketId: string;
  assignmentId: string;
  market: string;
  final: string;
  mine: string;
  audit: string;
  reward: string;
  note: string;
  date: string;
};

export type ReviewerWorkbenchData = {
  reviewer: {
    id: string;
    walletAddress: string;
    displayName: string;
    initials: string;
    tier: string;
    badge: string;
    score: number;
    specialty: string;
    progress: number;
  };
  stats: {
    activeCases: number;
    dueSoon: number;
    autoPaid: string;
    reviewerScore: number;
    reviewerTier: string;
    pending: string;
    thisMonth: string;
    lifetime: string;
    validSubmissions: number;
    topNoteWins: number;
    noRewardReviews: number;
  };
  cases: ReviewerCase[];
  history: HistoryRow[];
  earnings: {
    chart: Record<"7D" | "30D" | "90D" | "Life", EarningsPoint[]>;
    details: Record<"pending" | "paid" | "month" | "lifetime", EarningsDetail>;
  };
  meta: {
    wallet: string;
    generatedAt: string;
  };
};

export type ReviewDraft = {
  outcome: ReviewerOutcome | null;
  confidence: ConfidenceLabel | "";
  note: string;
  nonce?: string;
  noteHash?: string;
  saved: boolean;
  submitted: boolean;
  revealed: boolean;
  audit: {
    ok: boolean;
    reasons: string[];
  } | null;
  checks: {
    source: boolean;
    timestamp: boolean;
    rule: boolean;
    fallback: boolean;
  };
};
