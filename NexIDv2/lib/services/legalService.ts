export const legalPages = {
  faq: [
    "FAQ",
    "What is NexID?",
    "NexID is a CT-native edge board where users ride or fade live narratives, generate receipts, earn points, climb boards and build a portable .id edge profile.",
    "Do I need .id to use it?",
    "No. You can explore narratives and take sides first. .id becomes useful once you have receipts and want to own your edge history."
  ],
  terms: [
    "Terms of Use",
    "Use of the product",
    "You are responsible for your own actions. NexID provides an interface, social layer, receipts, points, profiles and boards.",
    "Accounts and wallets",
    "Do not use NexID to bypass restrictions, impersonate others, abuse referrals or manipulate boards."
  ],
  privacy: [
    "Privacy Policy",
    "Data we collect",
    "Wallet address, optional display identity, positions routed through NexID, receipts, points, referrals and basic security signals.",
    "How we use it",
    "To power positions, cards, boards, profiles, referrals, safety checks and product analytics."
  ],
  risk: [
    "Risk Notice",
    "Risk is real",
    "Positions can lose value. You can lose the full amount you put into a position. Nothing on NexID is financial advice.",
    "Receipts are not promises",
    "Past receipts do not guarantee future outcomes."
  ],
  restricted: [
    "Restricted Locations",
    "Eligibility",
    "Some market rails may restrict access by location. NexID checks eligibility before position placement where required.",
    "No bypassing",
    "Do not use VPNs or other methods to bypass restrictions."
  ],
  points: [
    "Points Terms",
    "Edge Points",
    "Edge Points are part of the NexID season game. They track participation, receipts, shares, referrals and board movement.",
    "Abuse",
    "Spam, wash activity, self-referrals and low-quality farming can lead to point removal."
  ],
  mint: [
    ".id Mint Terms",
    "Minting .id",
    "A .id is your edge passport name. Pricing may vary by rarity. Mints are final once confirmed.",
    "Reputation",
    "A .id does not buy reputation. It claims what you earn."
  ]
};

export type LegalKey = keyof typeof legalPages;

export const legalLabels: Record<LegalKey, string> = {
  faq: "FAQ",
  terms: "Terms",
  privacy: "Privacy",
  risk: "Risk Notice",
  restricted: "Restricted Locations",
  points: "Points Terms",
  mint: ".id Terms"
};
