// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPartnerCampaigns {
    function getUserCampaignPoints(
        uint256 campaignId,
        address user
    ) external view returns (uint256);

    function getTotalCampaignPoints(
        uint256 campaignId
    ) external view returns (uint256);

    function getCampaignSponsor(
        uint256 campaignId
    ) external view returns (address);
}

/**
 * @title CampaignEscrow
 * @notice Escrow contract for partner campaign prize pools (USDC).
 * @dev Holds USDC deposited by sponsors. After a campaign's endTimestamp passes,
 *      participants claim their proportional share of the prize pool based on
 *      their on-chain points in PartnerCampaigns.
 *
 * Simplified flow (fully automated):
 * 1. Owner creates an escrow campaign linked to a PartnerCampaigns campaign ID
 * 2. Sponsor (or anyone) funds the campaign with USDC
 * 3. Campaign runs, points accumulate in PartnerCampaigns
 * 4. After endTimestamp, campaign is automatically "ended" — no manual close needed
 * 5. Participants call claim() — contract reads their points on-chain, calculates
 *    proportional share, and sends USDC directly
 * 6. Sponsor can withdraw any remaining funds after a grace period
 */
contract CampaignEscrow is Ownable {
    using SafeERC20 for IERC20;

    struct EscrowCampaign {
        uint256 partnerCampaignId;
        address sponsor;
        uint256 totalFunded;
        uint256 totalDistributed;
        uint256 endTimestamp;
    }

    IERC20 public immutable usdc;
    IPartnerCampaigns public partnerCampaigns;

    /// @notice Grace period after campaign ends before sponsor can withdraw remaining funds
    uint256 public constant CLAIM_GRACE_PERIOD = 30 days;

    uint256 public campaignCounter;
    mapping(uint256 => EscrowCampaign) public campaigns;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    event CampaignCreated(
        uint256 indexed escrowId,
        uint256 indexed partnerCampaignId,
        address indexed sponsor,
        uint256 endTimestamp
    );
    event CampaignFunded(
        uint256 indexed escrowId,
        address indexed funder,
        uint256 amount,
        uint256 totalFunded
    );
    event RewardClaimed(
        uint256 indexed escrowId,
        address indexed claimer,
        uint256 userPoints,
        uint256 totalPoints,
        uint256 amount
    );
    event PartnerCampaignsUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );
    event SponsorWithdrawal(
        uint256 indexed escrowId,
        address indexed sponsor,
        uint256 amount
    );

    error InvalidAddress();
    error InvalidTimestamp();
    error InvalidAmount();
    error CampaignNotFound();
    error CampaignStillActive();
    error CampaignAlreadyClosed();
    error NotSponsorOrOwner();
    error AlreadyClaimed();
    error NoPointsEarned();
    error NoPointsInCampaign();
    error NothingToWithdraw();
    error GracePeriodNotOver();
    error InsufficientEscrowBalance();

    modifier onlySponsorOrOwner(uint256 escrowId) {
        EscrowCampaign storage c = campaigns[escrowId];
        if (msg.sender != c.sponsor && msg.sender != owner())
            revert NotSponsorOrOwner();
        _;
    }

    constructor(
        address _owner,
        address _usdc,
        address _partnerCampaigns
    ) Ownable(_owner) {
        if (_owner == address(0) || _usdc == address(0))
            revert InvalidAddress();
        usdc = IERC20(_usdc);
        if (_partnerCampaigns != address(0)) {
            partnerCampaigns = IPartnerCampaigns(_partnerCampaigns);
        }
    }

    // ============ OWNER-ONLY ADMIN FUNCTIONS ============

    function setPartnerCampaigns(address _partnerCampaigns) external onlyOwner {
        address old = address(partnerCampaigns);
        partnerCampaigns = IPartnerCampaigns(_partnerCampaigns);
        emit PartnerCampaignsUpdated(old, _partnerCampaigns);
    }

    function createCampaign(
        uint256 _partnerCampaignId,
        address _sponsor,
        uint256 _endTimestamp
    ) external onlyOwner returns (uint256) {
        if (_sponsor == address(0)) revert InvalidAddress();
        if (_endTimestamp <= block.timestamp) revert InvalidTimestamp();

        uint256 id = campaignCounter++;

        campaigns[id] = EscrowCampaign({
            partnerCampaignId: _partnerCampaignId,
            sponsor: _sponsor,
            totalFunded: 0,
            totalDistributed: 0,
            endTimestamp: _endTimestamp
        });

        emit CampaignCreated(id, _partnerCampaignId, _sponsor, _endTimestamp);
        return id;
    }

    // ============ FUNDING ============

    /// @notice Fund a campaign's prize pool with USDC
    /// @dev Caller must have approved this contract to spend USDC
    function fundCampaign(uint256 escrowId, uint256 amount) external {
        if (amount == 0) revert InvalidAmount();

        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        if (block.timestamp >= c.endTimestamp) revert CampaignAlreadyClosed();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        c.totalFunded += amount;

        emit CampaignFunded(escrowId, msg.sender, amount, c.totalFunded);
    }

    // ============ AUTOMATED CLAIMING ============

    /**
     * @notice Claim your proportional share of the prize pool.
     * @dev Reads your points directly from PartnerCampaigns on-chain.
     *      Reward = (yourPoints / totalPoints) × totalFunded
     *      No Merkle proofs, no manual close, no owner intervention.
     *      Campaign is "ended" automatically when block.timestamp >= endTimestamp.
     * @param escrowId Escrow campaign identifier.
     */
    function claim(uint256 escrowId) external {
        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        if (block.timestamp < c.endTimestamp) revert CampaignStillActive();
        if (hasClaimed[escrowId][msg.sender]) revert AlreadyClaimed();

        // Read points directly from PartnerCampaigns
        uint256 userPoints = partnerCampaigns.getUserCampaignPoints(
            c.partnerCampaignId,
            msg.sender
        );
        if (userPoints == 0) revert NoPointsEarned();

        uint256 totalPoints = partnerCampaigns.getTotalCampaignPoints(
            c.partnerCampaignId
        );
        if (totalPoints == 0) revert NoPointsInCampaign();

        // Calculate proportional reward: (userPoints / totalPoints) × totalFunded
        uint256 reward = (c.totalFunded * userPoints) / totalPoints;
        if (reward == 0) revert InvalidAmount();

        uint256 remaining = c.totalFunded - c.totalDistributed;
        if (reward > remaining) revert InsufficientEscrowBalance();

        hasClaimed[escrowId][msg.sender] = true;
        c.totalDistributed += reward;
        usdc.safeTransfer(msg.sender, reward);

        emit RewardClaimed(
            escrowId,
            msg.sender,
            userPoints,
            totalPoints,
            reward
        );
    }

    // ============ SPONSOR WITHDRAWAL ============

    /// @notice Withdraw remaining undistributed funds after the claim grace period
    /// @dev Grace period gives participants time to claim before sponsor can sweep
    function withdrawRemaining(
        uint256 escrowId
    ) external onlySponsorOrOwner(escrowId) {
        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        if (block.timestamp < c.endTimestamp) revert CampaignStillActive();
        if (block.timestamp < c.endTimestamp + CLAIM_GRACE_PERIOD)
            revert GracePeriodNotOver();

        uint256 remaining = c.totalFunded - c.totalDistributed;
        if (remaining == 0) revert NothingToWithdraw();

        c.totalDistributed = c.totalFunded;
        usdc.safeTransfer(c.sponsor, remaining);

        emit SponsorWithdrawal(escrowId, c.sponsor, remaining);
    }

    // ============ VIEW FUNCTIONS ============

    function remainingBalance(
        uint256 escrowId
    ) external view returns (uint256) {
        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        return c.totalFunded - c.totalDistributed;
    }

    function getCampaign(
        uint256 escrowId
    ) external view returns (EscrowCampaign memory) {
        if (campaigns[escrowId].sponsor == address(0))
            revert CampaignNotFound();
        return campaigns[escrowId];
    }

    function numCampaigns() external view returns (uint256) {
        return campaignCounter;
    }

    /// @notice Check if a campaign has ended (timestamp-based, automatic)
    function hasEnded(uint256 escrowId) external view returns (bool) {
        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        return block.timestamp >= c.endTimestamp;
    }

    /// @notice Preview what a user would receive if they claim now
    function previewClaim(
        uint256 escrowId,
        address user
    ) external view returns (uint256 reward) {
        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        if (block.timestamp < c.endTimestamp) return 0;
        if (hasClaimed[escrowId][user]) return 0;

        uint256 userPoints = partnerCampaigns.getUserCampaignPoints(
            c.partnerCampaignId,
            user
        );
        if (userPoints == 0) return 0;

        uint256 totalPoints = partnerCampaigns.getTotalCampaignPoints(
            c.partnerCampaignId
        );
        if (totalPoints == 0) return 0;

        return (c.totalFunded * userPoints) / totalPoints;
    }
}
