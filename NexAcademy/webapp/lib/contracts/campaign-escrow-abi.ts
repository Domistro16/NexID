/**
 * ABI for the redesigned CampaignEscrow contract.
 * Simplified: no Merkle proofs, no manual close, no EIP-712 signatures.
 * Claims are proportional based on on-chain points from PartnerCampaigns.
 */
export const CAMPAIGN_ESCROW_ABI = [
    // ── Admin (owner) ──
    'function createCampaign(uint256 _partnerCampaignId, address _sponsor, uint256 _endTimestamp) external returns (uint256)',
    'function setPartnerCampaigns(address _partnerCampaigns) external',

    // ── Funding ──
    'function fundCampaign(uint256 escrowId, uint256 amount) external',

    // ── Claiming (automated, reads on-chain points) ──
    'function claim(uint256 escrowId) external',

    // ── Sponsor withdrawal ──
    'function withdrawRemaining(uint256 escrowId) external',

    // ── View functions ──
    'function hasClaimed(uint256, address) view returns (bool)',
    'function hasEnded(uint256 escrowId) view returns (bool)',
    'function remainingBalance(uint256 escrowId) view returns (uint256)',
    'function getCampaign(uint256 escrowId) view returns (tuple(uint256 partnerCampaignId, address sponsor, uint256 totalFunded, uint256 totalDistributed, uint256 endTimestamp))',
    'function numCampaigns() view returns (uint256)',
    'function previewClaim(uint256 escrowId, address user) view returns (uint256 reward)',
    'function CLAIM_GRACE_PERIOD() view returns (uint256)',

    // ── Events ──
    'event CampaignCreated(uint256 indexed escrowId, uint256 indexed partnerCampaignId, address indexed sponsor, uint256 endTimestamp)',
    'event CampaignFunded(uint256 indexed escrowId, address indexed funder, uint256 amount, uint256 totalFunded)',
    'event RewardClaimed(uint256 indexed escrowId, address indexed claimer, uint256 userPoints, uint256 totalPoints, uint256 amount)',
    'event SponsorWithdrawal(uint256 indexed escrowId, address indexed sponsor, uint256 amount)',
] as const;

/**
 * EIP-712 typed data for gasless claim signatures.
 * Kept here because claim submit route verifies signatures server-side.
 */
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
