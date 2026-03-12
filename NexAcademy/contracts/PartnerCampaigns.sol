// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PartnerCampaigns
 * @notice Campaigns created for partner projects with points and leaderboard tracking.
 * @dev Points are stored on-chain per user per campaign. Leaderboard ranking is computed
 *      off-chain from on-chain point data for gas efficiency. Tasks (watching lessons,
 *      social posts, on-chain transactions) are verified off-chain and points are awarded
 *      by the relayer. Each campaign has its own leaderboard.
 *
 * Gas optimization strategy:
 * - Points stored as mapping(campaignId => mapping(user => uint256)) — ~5k gas per warm update
 * - Participant list stored as array for enumeration
 * - Sorting done off-chain; on-chain data is the source of truth
 * - Batch point updates to amortize base tx cost
 */
contract PartnerCampaigns is Ownable {
    struct Campaign {
        uint256 id;
        string title;
        string description;
        string category;
        string level;
        string thumbnailUrl;
        string duration;
        uint256 totalTasks;
        // Sponsor metadata
        address sponsor;
        string sponsorName;
        string sponsorLogo;
        // Prize pool (informational — actual funds held in CampaignEscrow)
        uint256 prizePool;
        // Timing
        uint256 startTime;
        uint256 endTime;
        bool isActive;
    }

    uint256 public campaignCounter;
    address public relayer;

    mapping(uint256 => Campaign) internal _campaigns;
    mapping(address => mapping(uint256 => bool)) public isEnrolled;
    mapping(address => mapping(uint256 => bool)) public hasCompleted;

    // Points per user per campaign (the on-chain leaderboard data)
    mapping(uint256 => mapping(address => uint256)) public campaignPoints;

    // Running total of all points awarded per campaign (for proportional reward calculation)
    mapping(uint256 => uint256) public totalCampaignPoints;

    // Participant tracking per campaign
    mapping(uint256 => address[]) internal _participants;
    mapping(uint256 => mapping(address => bool)) internal _isParticipant;

    event CampaignCreated(
        uint256 indexed campaignId,
        string title,
        address indexed sponsor
    );
    event CampaignUpdated(uint256 indexed campaignId, string title);
    event CampaignDeactivated(uint256 indexed campaignId);
    event UserEnrolled(address indexed user, uint256 indexed campaignId);
    event CampaignCompleted(
        address indexed user,
        uint256 indexed campaignId,
        uint256 timestamp
    );
    event PointsAwarded(
        uint256 indexed campaignId,
        address indexed user,
        uint256 points,
        uint256 totalPoints
    );
    event BatchPointsAwarded(uint256 indexed campaignId, uint256 userCount);
    event RelayerUpdated(
        address indexed oldRelayer,
        address indexed newRelayer
    );

    error NotRelayer();
    error CampaignNotFound();
    error CampaignNotActive();
    error CampaignEnded();
    error AlreadyEnrolled();
    error NotEnrolled();
    error AlreadyCompleted();
    error LengthMismatch();
    error InvalidAddress();

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    constructor(address _owner) Ownable(_owner) {}

    // ============ OWNER-ONLY ADMIN FUNCTIONS ============

    function setRelayer(address _relayer) external onlyOwner {
        address old = relayer;
        relayer = _relayer;
        emit RelayerUpdated(old, _relayer);
    }

    function createCampaign(
        string memory _title,
        string memory _description,
        string memory _category,
        string memory _level,
        string memory _thumbnailUrl,
        string memory _duration,
        uint256 _totalTasks,
        address _sponsor,
        string memory _sponsorName,
        string memory _sponsorLogo,
        uint256 _prizePool,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyOwner returns (uint256) {
        if (_sponsor == address(0)) revert InvalidAddress();

        uint256 id = campaignCounter++;

        Campaign storage c = _campaigns[id];
        c.id = id;
        c.title = _title;
        c.description = _description;
        c.category = _category;
        c.level = _level;
        c.thumbnailUrl = _thumbnailUrl;
        c.duration = _duration;
        c.totalTasks = _totalTasks;
        c.sponsor = _sponsor;
        c.sponsorName = _sponsorName;
        c.sponsorLogo = _sponsorLogo;
        c.prizePool = _prizePool;
        c.startTime = _startTime;
        c.endTime = _endTime;
        c.isActive = true;

        emit CampaignCreated(id, _title, _sponsor);
        return id;
    }

    function updateCampaign(
        uint256 _campaignId,
        string memory _title,
        string memory _description,
        string memory _category,
        string memory _level,
        string memory _thumbnailUrl,
        string memory _duration,
        uint256 _totalTasks,
        address _sponsor,
        string memory _sponsorName,
        string memory _sponsorLogo,
        uint256 _prizePool,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyOwner {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();

        Campaign storage c = _campaigns[_campaignId];
        c.title = _title;
        c.description = _description;
        c.category = _category;
        c.level = _level;
        c.thumbnailUrl = _thumbnailUrl;
        c.duration = _duration;
        c.totalTasks = _totalTasks;
        c.sponsor = _sponsor;
        c.sponsorName = _sponsorName;
        c.sponsorLogo = _sponsorLogo;
        c.prizePool = _prizePool;
        c.startTime = _startTime;
        c.endTime = _endTime;

        emit CampaignUpdated(_campaignId, _title);
    }

    function deactivateCampaign(uint256 _campaignId) external onlyOwner {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        _campaigns[_campaignId].isActive = false;
        emit CampaignDeactivated(_campaignId);
    }

    // ============ ENROLLMENT ============

    /// @notice Enroll a user in a campaign (open to anyone)
    function enroll(uint256 _campaignId, address _user) external {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        Campaign storage c = _campaigns[_campaignId];
        if (!c.isActive) revert CampaignNotActive();
        if (c.endTime > 0 && block.timestamp > c.endTime)
            revert CampaignEnded();
        if (isEnrolled[_user][_campaignId]) revert AlreadyEnrolled();
        if (hasCompleted[_user][_campaignId]) revert AlreadyCompleted();

        isEnrolled[_user][_campaignId] = true;
        if (!_isParticipant[_campaignId][_user]) {
            _participants[_campaignId].push(_user);
            _isParticipant[_campaignId][_user] = true;
        }

        emit UserEnrolled(_user, _campaignId);
    }

    // ============ RELAYER FUNCTIONS ============

    /// @notice Award points to a user for completing a task
    function addPoints(
        uint256 _campaignId,
        address _user,
        uint256 _points
    ) external onlyRelayer {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        if (!_isParticipant[_campaignId][_user]) revert NotEnrolled();

        campaignPoints[_campaignId][_user] += _points;
        totalCampaignPoints[_campaignId] += _points;

        emit PointsAwarded(
            _campaignId,
            _user,
            _points,
            campaignPoints[_campaignId][_user]
        );
    }

    /// @notice Batch award points to multiple users in one transaction
    function batchAddPoints(
        uint256 _campaignId,
        address[] calldata _users,
        uint256[] calldata _points
    ) external onlyRelayer {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        if (_users.length != _points.length) revert LengthMismatch();

        for (uint256 i = 0; i < _users.length; i++) {
            if (!_isParticipant[_campaignId][_users[i]]) revert NotEnrolled();
            campaignPoints[_campaignId][_users[i]] += _points[i];
            totalCampaignPoints[_campaignId] += _points[i];

            emit PointsAwarded(
                _campaignId,
                _users[i],
                _points[i],
                campaignPoints[_campaignId][_users[i]]
            );
        }

        emit BatchPointsAwarded(_campaignId, _users.length);
    }

    /// @notice Mark a campaign as completed for a user (relayer only)
    function completeCampaign(
        uint256 _campaignId,
        address _user
    ) external onlyRelayer {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        if (!isEnrolled[_user][_campaignId]) revert NotEnrolled();
        if (hasCompleted[_user][_campaignId]) revert AlreadyCompleted();

        isEnrolled[_user][_campaignId] = false;
        hasCompleted[_user][_campaignId] = true;

        emit CampaignCompleted(_user, _campaignId, block.timestamp);
    }

    // ============ VIEW FUNCTIONS ============

    function getCampaign(
        uint256 _campaignId
    ) external view returns (Campaign memory) {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        return _campaigns[_campaignId];
    }

    function getAllCampaigns() external view returns (Campaign[] memory) {
        Campaign[] memory all = new Campaign[](campaignCounter);
        for (uint256 i = 0; i < campaignCounter; i++) {
            all[i] = _campaigns[i];
        }
        return all;
    }

    function getUserCampaignPoints(
        uint256 _campaignId,
        address _user
    ) external view returns (uint256) {
        return campaignPoints[_campaignId][_user];
    }

    function getParticipantCount(
        uint256 _campaignId
    ) external view returns (uint256) {
        return _participants[_campaignId].length;
    }

    function getParticipants(
        uint256 _campaignId
    ) external view returns (address[] memory) {
        return _participants[_campaignId];
    }

    /// @notice Get leaderboard data (unsorted — sort off-chain for gas efficiency)
    /// @return users Array of participant addresses
    /// @return points Array of corresponding point totals
    function getLeaderboard(
        uint256 _campaignId
    ) external view returns (address[] memory users, uint256[] memory points) {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();

        address[] memory parts = _participants[_campaignId];
        uint256[] memory pts = new uint256[](parts.length);

        for (uint256 i = 0; i < parts.length; i++) {
            pts[i] = campaignPoints[_campaignId][parts[i]];
        }

        return (parts, pts);
    }

    function getCampaignSponsor(
        uint256 _campaignId
    ) external view returns (address) {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        return _campaigns[_campaignId].sponsor;
    }

    function isUserEnrolled(
        address _user,
        uint256 _campaignId
    ) external view returns (bool) {
        return isEnrolled[_user][_campaignId];
    }

    function hasUserCompleted(
        address _user,
        uint256 _campaignId
    ) external view returns (bool) {
        return hasCompleted[_user][_campaignId];
    }

    function numCampaigns() external view returns (uint256) {
        return campaignCounter;
    }

    function getTotalCampaignPoints(
        uint256 _campaignId
    ) external view returns (uint256) {
        return totalCampaignPoints[_campaignId];
    }
}
