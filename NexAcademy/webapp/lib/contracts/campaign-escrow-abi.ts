/**
 * ABI for CampaignEscrow.
 * Reward amounts are finalized off-chain and committed on-chain as a Merkle root.
 */
export const CAMPAIGN_ESCROW_ABI = [
  "function createCampaign(uint256 _partnerCampaignId, address _sponsor, uint256 _endTimestamp) external returns (uint256)",
  "function setPartnerCampaigns(address _partnerCampaigns) external",
  "function fundCampaign(uint256 escrowId, uint256 amount) external",
  "function setClaimRoot(uint256 escrowId, bytes32 _merkleRoot) external",
  "function claim(uint256 escrowId, uint256 amount, bytes32[] merkleProof) external",
  "function claimRewardFor(uint256 escrowId, address claimer, uint256 amount, bytes32[] merkleProof, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function withdrawRemaining(uint256 escrowId) external",
  "function claimRoots(uint256) view returns (bytes32)",
  "function hasClaimed(uint256, address) view returns (bool)",
  "function hasReceivedReward(uint256, address) view returns (bool)",
  "function hasEnded(uint256 escrowId) view returns (bool)",
  "function remainingBalance(uint256 escrowId) view returns (uint256)",
  "function getCampaign(uint256 escrowId) view returns (tuple(uint256 partnerCampaignId, address sponsor, uint256 totalFunded, uint256 totalDistributed, uint256 endTimestamp))",
  "function numCampaigns() view returns (uint256)",
  "function previewClaim(uint256 escrowId, address user, uint256 amount, bytes32[] merkleProof) view returns (uint256 reward)",
  "function CLAIM_GRACE_PERIOD() view returns (uint256)",
  "event CampaignCreated(uint256 indexed escrowId, uint256 indexed partnerCampaignId, address indexed sponsor, uint256 endTimestamp)",
  "event CampaignFunded(uint256 indexed escrowId, address indexed funder, uint256 amount, uint256 totalFunded)",
  "event ClaimRootUpdated(uint256 indexed escrowId, bytes32 merkleRoot)",
  "event RewardClaimed(uint256 indexed escrowId, address indexed claimer, uint256 amount)",
  "event AdminWithdrawal(uint256 indexed escrowId, uint256 amount)",
] as const;

export const CLAIM_REWARD_TYPES = {
  ClaimReward: [
    { name: "escrowId", type: "uint256" },
    { name: "claimer", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export function buildClaimDomain(escrowAddress: string, chainId: number | bigint) {
  return {
    name: "CampaignEscrow",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: escrowAddress,
  } as const;
}
