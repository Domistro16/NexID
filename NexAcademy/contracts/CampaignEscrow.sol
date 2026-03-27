// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface IPartnerCampaigns {
    function getCampaignSponsor(uint256 campaignId) external view returns (address);
}

/**
 * @title CampaignEscrow
 * @notice USDC escrow for finalized campaign reward distributions.
 * @dev The backend computes ranked allocations and publishes a Merkle root.
 *      The contract only verifies the root, transfers rewards, and enforces
 *      owner-only funding so campaign economics stay aligned with the webapp.
 */
contract CampaignEscrow is Ownable, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 private constant CLAIM_REWARD_TYPEHASH =
        keccak256(
            "ClaimReward(uint256 escrowId,address claimer,uint256 amount,uint256 deadline)"
        );

    struct EscrowCampaign {
        uint256 partnerCampaignId;
        address sponsor;
        uint256 totalFunded;
        uint256 totalDistributed;
        uint256 endTimestamp;
    }

    IERC20 public immutable usdc;
    IPartnerCampaigns public partnerCampaigns;

    uint256 public constant CLAIM_GRACE_PERIOD = 30 days;

    uint256 public campaignCounter;
    mapping(uint256 => EscrowCampaign) public campaigns;
    mapping(uint256 => bytes32) public claimRoots;
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
    event ClaimRootUpdated(uint256 indexed escrowId, bytes32 merkleRoot);
    event RewardClaimed(
        uint256 indexed escrowId,
        address indexed claimer,
        uint256 amount
    );
    event PartnerCampaignsUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );
    event AdminWithdrawal(uint256 indexed escrowId, uint256 amount);

    error InvalidAddress();
    error InvalidTimestamp();
    error InvalidAmount();
    error CampaignNotFound();
    error CampaignStillActive();
    error CampaignAlreadyClosed();
    error AlreadyClaimed();
    error ClaimRootMissing();
    error InvalidProof();
    error SignatureExpired();
    error InvalidSigner();
    error NothingToWithdraw();
    error GracePeriodNotOver();
    error InsufficientEscrowBalance();

    constructor(
        address _owner,
        address _usdc,
        address _partnerCampaigns
    ) Ownable(_owner) EIP712("CampaignEscrow", "1") {
        if (_owner == address(0) || _usdc == address(0)) {
            revert InvalidAddress();
        }

        usdc = IERC20(_usdc);
        if (_partnerCampaigns != address(0)) {
            partnerCampaigns = IPartnerCampaigns(_partnerCampaigns);
        }
    }

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

    function fundCampaign(uint256 escrowId, uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidAmount();

        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        if (block.timestamp >= c.endTimestamp) revert CampaignAlreadyClosed();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        c.totalFunded += amount;

        emit CampaignFunded(escrowId, msg.sender, amount, c.totalFunded);
    }

    function setClaimRoot(
        uint256 escrowId,
        bytes32 _merkleRoot
    ) external onlyOwner {
        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        if (_merkleRoot == bytes32(0)) revert InvalidAmount();

        claimRoots[escrowId] = _merkleRoot;
        emit ClaimRootUpdated(escrowId, _merkleRoot);
    }

    function claim(
        uint256 escrowId,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external {
        _claim(escrowId, msg.sender, amount, merkleProof);
    }

    function claimRewardFor(
        uint256 escrowId,
        address claimer,
        uint256 amount,
        bytes32[] calldata merkleProof,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_REWARD_TYPEHASH,
                escrowId,
                claimer,
                amount,
                deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != claimer) revert InvalidSigner();

        _claim(escrowId, claimer, amount, merkleProof);
    }

    function withdrawRemaining(uint256 escrowId) external onlyOwner {
        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        if (block.timestamp < c.endTimestamp) revert CampaignStillActive();
        if (block.timestamp < c.endTimestamp + CLAIM_GRACE_PERIOD) {
            revert GracePeriodNotOver();
        }

        uint256 remaining = c.totalFunded - c.totalDistributed;
        if (remaining == 0) revert NothingToWithdraw();

        c.totalDistributed = c.totalFunded;
        usdc.safeTransfer(owner(), remaining);

        emit AdminWithdrawal(escrowId, remaining);
    }

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
        if (campaigns[escrowId].sponsor == address(0)) {
            revert CampaignNotFound();
        }
        return campaigns[escrowId];
    }

    function numCampaigns() external view returns (uint256) {
        return campaignCounter;
    }

    function hasEnded(uint256 escrowId) external view returns (bool) {
        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        return block.timestamp >= c.endTimestamp;
    }

    function hasReceivedReward(
        uint256 escrowId,
        address user
    ) external view returns (bool) {
        return hasClaimed[escrowId][user];
    }

    function previewClaim(
        uint256 escrowId,
        address user,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external view returns (uint256 reward) {
        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        if (block.timestamp < c.endTimestamp) return 0;
        if (hasClaimed[escrowId][user]) return 0;
        if (_verifyClaim(escrowId, user, amount, merkleProof)) {
            return amount;
        }
        return 0;
    }

    function _claim(
        uint256 escrowId,
        address claimer,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) internal {
        EscrowCampaign storage c = campaigns[escrowId];
        if (c.sponsor == address(0)) revert CampaignNotFound();
        if (block.timestamp < c.endTimestamp) revert CampaignStillActive();
        if (hasClaimed[escrowId][claimer]) revert AlreadyClaimed();
        if (amount == 0) revert InvalidAmount();
        if (!_verifyClaim(escrowId, claimer, amount, merkleProof)) {
            revert InvalidProof();
        }

        uint256 remaining = c.totalFunded - c.totalDistributed;
        if (amount > remaining) revert InsufficientEscrowBalance();

        hasClaimed[escrowId][claimer] = true;
        c.totalDistributed += amount;
        usdc.safeTransfer(claimer, amount);

        emit RewardClaimed(escrowId, claimer, amount);
    }

    function _verifyClaim(
        uint256 escrowId,
        address claimer,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) internal view returns (bool) {
        bytes32 root = claimRoots[escrowId];
        if (root == bytes32(0)) revert ClaimRootMissing();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(claimer, amount))));
        return MerkleProof.verify(merkleProof, root, leaf);
    }
}
