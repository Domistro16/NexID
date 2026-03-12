export const GOPLUS_API_BASE = "https://api.gopluslabs.io/api/v1";

export const CHAIN_IDS = {
  BASE_MAINNET: "8453",
  BASE_SEPOLIA: "84532",
} as const;

export const SLASH_AMOUNTS = {
  cybercrime: 50,
  money_laundering: 40,
  blacklist_doubt: 30,
  blackmail_activities: 35,
  stealing_attack: 45,
  phishing_activities: 40,
  fake_kyc: 20,
  malicious_mining_activities: 25,
  darkweb_transactions: 35,
  honeypot_related_address: 30,
  financial_crime: 40,
} as const;

export const TIERS = {
  PLATINUM: { min: 90, max: 100, label: "Platinum", color: "#E5E4E2" },
  GOLD: { min: 70, max: 89, label: "Gold", color: "#FFD700" },
  SILVER: { min: 40, max: 69, label: "Silver", color: "#C0C0C0" },
  BRONZE: { min: 0, max: 39, label: "Bronze", color: "#CD7F32" },
} as const;

export const RISK_LABELS: Record<string, string> = {
  cybercrime: "Cybercrime",
  money_laundering: "Money Laundering",
  blacklist_doubt: "Blacklisted",
  blackmail_activities: "Blackmail",
  stealing_attack: "Theft/Hacking",
  phishing_activities: "Phishing",
  fake_kyc: "Fake KYC",
  malicious_mining_activities: "Malicious Mining",
  darkweb_transactions: "Darkweb Activity",
  honeypot_related_address: "Honeypot Related",
  financial_crime: "Financial Crime",
};
