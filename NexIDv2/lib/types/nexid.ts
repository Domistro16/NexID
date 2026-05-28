export type Side = "ride" | "fade";
export type OrderType = "market" | "limit";
export type ThemeMode = "light" | "dark";
export type ExecutionMode = "disabled" | "operator_controlled" | "user_signed";

export type Narrative = {
  id: string;
  name: string;
  tag: string;
  summary: string;
  heat: number;
  move7d: number;
  quality: "Strong" | "Hot" | "Clean" | "Mixed";
  liquidity: number;
  spread: number;
  volume: number;
  riders: number;
  faders: number;
  expiry: string;
  top: string;
  ridePrice: number;
  fadePrice: number;
  chart: number[];
  comments: string[];
  rules: string[];
  bestMarketId?: string | null;
  qualityScore?: number;
  tradable?: boolean;
  fallbackReason?: string | null;
};

export type Position = {
  id: string;
  userId?: string | null;
  narrativeId: string;
  marketId?: string | null;
  narrativeName: string;
  side: Side;
  orderType: OrderType;
  amount: number;
  entryPrice: number;
  requestedWalletAddress?: string | null;
  executionMode?: ExecutionMode | string;
  marketQualityScore?: number | null;
  outcomeToken?: string | null;
  executionId?: string | null;
  proof?: string | null;
  fillStatus?: string | null;
  status: "pending" | "live" | "partial_fill" | "filled" | "closed" | "resolved" | "failed";
  exitPrice?: number | null;
  settlementPrice?: number | null;
  exitValue?: number | null;
  settlementSource?: string | null;
  settledAt?: string | null;
  createdAt: string;
};

export type Receipt = {
  id: string;
  positionId: string;
  narrativeName: string;
  side: Side;
  returnPct: number;
  proofLevel: string;
  edgePoints: number;
  edgeScore?: number;
  scoreBreakdown?: Record<string, number> | null;
  rank: string;
  identity: string;
  publicUrl: string;
  status?: string;
  cardAsset?: string | null;
  settlementSource?: string | null;
  settledAt?: string | null;
};

export type LegacyBoardEntry = [identity: string, thesis: string, result: string, points: string, rank: string];

export type BoardEntry = {
  id: string;
  identity: string;
  thesis: string;
  result: string;
  points: string;
  rank: string;
  rankNumber: number;
  movement: string;
  boardKey: BoardKey;
  category?: string | null;
  receiptId?: string | null;
  positionId?: string | null;
  edgeScore?: number | null;
};

export type BoardKey = "faders" | "riders" | "receipts" | "lowcap" | "global" | "regional" | "ai" | "base" | "solana" | "rwa";

export type ReferralStats = {
  clicks: number;
  signups: number;
  mints: number;
  pending: number;
  paid: number;
  copied: number;
  shared: number;
};

export type ReferralEvent = {
  id: string;
  title: string;
  sub: string;
  amount?: string;
};

export type RewardSummary = {
  seasonCode: string;
  seasonTitle: string;
  status: string;
  level: string;
  badge: string;
  lifetimePoints: number;
  weeklyScore: number;
  rewardPoolUsd: number;
  pendingUsd: number;
  paidUsd: number;
  projectedUsd: number;
  feePaidUsd: number;
  eligibleVolumeUsd: number;
  nextLevel: { level: string; badge: string; minPoints: number } | null;
  progressPct: number;
  riskFlag?: string | null;
};

export type AuthUser = {
  id: string;
  walletAddress: string;
  displayName?: string | null;
  primaryIdName?: string | null;
  primaryDomainName?: string | null;
  pointsTotal: number;
};

export type PolymarketTradingAccount = {
  ownerWalletAddress: string;
  funderAddress: string;
  signatureType: number;
  walletType: string;
  source: string;
  status: string;
  profileName?: string | null;
  updatedAt: string;
};

export type DashboardSnapshot = {
  user: AuthUser | null;
  positions: Position[];
  receipts: Receipt[];
  points: {
    total: number;
    rank: string;
    season: string;
    events: Array<{ id: string; reason: string; points: number; createdAt: string }>;
  };
  idNames: Array<{ name: string; label: string; status: string; isPrimary: boolean }>;
  referralStats: ReferralStats;
  referralEvents: ReferralEvent[];
  rewards: RewardSummary;
};

export type MintStage = "search" | "pay" | "activating" | "active";

export type CardMeta = {
  type: string;
  title: string;
  subtitle: string;
  big: string;
  accent?: string;
  proof: string;
  url: string;
  metrics: [label: string, value: string][];
};
