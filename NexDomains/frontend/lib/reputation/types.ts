export interface GoPlusRiskResult {
  cybercrime: string;
  money_laundering: string;
  blacklist_doubt: string;
  blackmail_activities: string;
  stealing_attack: string;
  phishing_activities: string;
  fake_kyc: string;
  malicious_mining_activities: string;
  darkweb_transactions: string;
  honeypot_related_address: string;
  financial_crime: string;
  contract_address: string;
  data_source: string;
}

export interface GoPlusResponse {
  code: number;
  message: string;
  result: GoPlusRiskResult;
}

export interface ReputationResult {
  address: string;
  score: number;
  tier: "Platinum" | "Gold" | "Silver" | "Bronze";
  flags: string[];
  breakdown: Record<string, number>;
  checkedAt: string;
  isClean: boolean;
}

export type RiskFlag = keyof typeof import("./constants").SLASH_AMOUNTS;
