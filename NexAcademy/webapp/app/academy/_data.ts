export const FAQS = [
  {
    q: "How are USDC rewards distributed?",
    a: "Sign a gasless transaction in the \"Ended Campaigns\" terminal to claim USDC directly to your primary linked EVM wallet based on your final rank. Contracts distribute funds automatically from the sponsor's liquidity pool.",
  },
  {
    q: "How do on-chain RPC verifications work?",
    a: "Our backend queries the respective chain's RPC nodes (Ethereum, Solana, etc.) for your connected wallet address. Once the requested transaction is confirmed on-chain, the academy UI will instantly unlock the next module. No manual proof is needed.",
  },
  {
    q: "What happens if I miss a Time-Locked module?",
    a: "Time-locked modules run on exact block timestamps. If you miss the initial drop, you can still complete the module anytime before the campaign officially ends. However, early completion yields a slight point multiplier on the leaderboard.",
  },
  {
    q: "Can I transfer my Interactive Scorecard (SBT)?",
    a: "No. Scorecards are Soulbound Tokens (SBTs) permanently bound to your `.id` identity. They serve as immutable, non-transferable proof of your knowledge and on-chain activity.",
  },
  {
    q: "Who pays the gas fees for claiming rewards?",
    a: "NexID utilizes Account Abstraction (ERC-4337) and Paymasters. This means the protocol sponsors the gas fees for your reward claims. You simply sign the transaction message.",
  },
];
