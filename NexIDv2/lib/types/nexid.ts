export type Side = "ride" | "fade";
export type ReceiptSide = Side | "launch" | "settlement" | "proof" | "invalid";
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
  source?: "native" | "polymarket_route" | "legacy";
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
  source?: "market_receipt" | "legacy";
  positionId: string;
  narrativeName: string;
  side: ReceiptSide;
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

export type CreatedMarketSummary = {
  id: string;
  title: string;
  category: string;
  status: string;
  volume: number;
  traders: number;
  split: string;
  creatorFee: number;
  claimable: number;
  bond: string;
  close: string;
  settlement: string;
  publicUrl: string;
};

export type AgentDashboardSummary = {
  id: string;
  name: string;
  status: string;
  agentId: string | null;
  agentIdLabel: string | null;
  ownerAccount: string | null;
  identity: string | null;
  userId: string | null;
  scopes: string[];
  dailyLaunchLimit: number;
  maxBondSpendUsdc: number;
  launchesToday: number;
  bondSpentTodayUsdc: number;
  limitsResetAt: string | null;
  launchingDisabled: boolean;
  pausedAt: string | null;
  revokedAt: string | null;
  lastLaunchAt: string | null;
  createdAt: string;
  updatedAt: string;
  joinDate?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  erc8004Ref?: string | null;
  erc8126ScoreRef?: string | null;
  reputation?: {
    marketsLaunched: number;
    creatorFeesEarned: number;
    invalidMarkets: number;
    disputedMarkets: number;
    resolvedMarkets: number;
    accurateResolutions: number;
    launchSuccessRate: number;
    resolutionAccuracy: number;
    invalidMarketRate: number;
    communityTrustScore: number;
    trustTier: string;
    calculationVersion: string;
    calculatedAt: string;
  };
  policy?: {
    canLaunch: boolean;
    dailyLaunchLimit: number;
    effectiveDailyLaunchLimit: number;
    maxBondSpendUsdc: number;
    requiredLaunchBondUsdc: number;
    restrictionReason: string | null;
  };
  badges?: Array<{
    code: string;
    label: string;
    description?: string | null;
    tier: string;
    awardedAt: string;
  }>;
  launchHistory: Array<{
    id: string;
    title: string;
    status: string;
    publicUrl: string;
    createdAt: string;
    bond: string;
  }>;
  drafts: Array<{
    id: string;
    title: string;
    riskStatus: string;
    createdAt: string;
  }>;
  validationFailures: Array<{
    id: string;
    action: string;
    status: string;
    detail: unknown;
    createdAt: string;
  }>;
  receipts: Array<{
    id: string;
    marketId: string;
    title: string;
    proof: string;
    publicUrl: string | null;
    createdAt: string;
  }>;
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
  whyRanked?: string | null;
  edgeRole?: string | null;
  username?: string | null;
  wallet?: string | null;
  avatar?: string | null;
  score?: number | null;
  lane?: "creators" | "riders" | "faders" | "overall" | string | null;
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

export type ClaimableBalanceSummary = {
  referral: {
    availableUsd: number;
    reservedUsd: number;
    spentUsd: number;
    claimedUsd: number;
  };
  edge: {
    availableUsd: number;
    lockedUsd: number;
    usableForMintUsd: number;
    reservedUsd: number;
    spentUsd: number;
    claimedUsd: number;
  };
  totalAvailableUsd: number;
  totalLockedUsd: number;
  totalUsableForMintUsd: number;
  totalReservedUsd: number;
  totalSpentUsd: number;
  totalClaimRequestedUsd: number;
  totalClaimedUsd: number;
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
  createdMarkets: CreatedMarketSummary[];
  agents: AgentDashboardSummary[];
  notifications?: Array<{
    id: string;
    type: string;
    status: string;
    title: string;
    body: string;
    marketId?: string | null;
    createdAt: string;
    readAt?: string | null;
  }>;
  points: {
    total: number;
    rank: string;
    season: string;
    events: Array<{ id: string; reason: string; points: number; createdAt: string }>;
  };
  idNames: Array<{ name: string; label: string; status: string; isPrimary: boolean; primaryOnchainRequired?: boolean; primaryOnchainMessage?: string }>;
  referralStats: ReferralStats;
  referralEvents: ReferralEvent[];
  rewards: RewardSummary;
  claimableBalance: ClaimableBalanceSummary;
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
