// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NexIDCampaigns
 * @notice Free, public campaigns created by SafuAcademy, sponsored by NexID.
 * @dev Campaign content (videos, quizzes, lessons) is stored off-chain.
 *      Only metadata, enrollment, and completion status are tracked on-chain.
 *      No points system, no leaderboard, no prize pool.
 */
contract NexIDCampaigns is Ownable {
    struct Campaign {
        uint256 id;
        string title;
        string description;
        string longDescription;
        string instructor;
        string[] objectives;
        string[] prerequisites;
        string category;
        string level;
        string thumbnailUrl;
        string duration;
        uint256 totalLessons;
        bool isActive;
    }

    uint256 public campaignCounter;
    address public relayer;

    mapping(uint256 => Campaign) internal _campaigns;
    mapping(address => mapping(uint256 => bool)) public isEnrolled;
    mapping(address => mapping(uint256 => bool)) public hasCompleted;
    mapping(uint256 => address[]) internal _participants;
    mapping(uint256 => mapping(address => bool)) internal _isParticipant;

    event CampaignCreated(uint256 indexed campaignId, string title);
    event CampaignUpdated(uint256 indexed campaignId, string title);
    event CampaignDeactivated(uint256 indexed campaignId);
    event UserEnrolled(address indexed user, uint256 indexed campaignId);
    event CampaignCompleted(
        address indexed user,
        uint256 indexed campaignId,
        uint256 timestamp
    );
    event RelayerUpdated(
        address indexed oldRelayer,
        address indexed newRelayer
    );

    error NotRelayer();
    error CampaignNotFound();
    error CampaignNotActive();
    error AlreadyEnrolled();
    error NotEnrolled();
    error AlreadyCompleted();

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
        string memory _longDescription,
        string memory _instructor,
        string[] memory _objectives,
        string[] memory _prerequisites,
        string memory _category,
        string memory _level,
        string memory _thumbnailUrl,
        string memory _duration,
        uint256 _totalLessons
    ) external onlyOwner returns (uint256) {
        uint256 id = campaignCounter++;

        Campaign storage c = _campaigns[id];
        c.id = id;
        c.title = _title;
        c.description = _description;
        c.longDescription = _longDescription;
        c.instructor = _instructor;
        c.objectives = _objectives;
        c.prerequisites = _prerequisites;
        c.category = _category;
        c.level = _level;
        c.thumbnailUrl = _thumbnailUrl;
        c.duration = _duration;
        c.totalLessons = _totalLessons;
        c.isActive = true;

        emit CampaignCreated(id, _title);
        return id;
    }

    function updateCampaign(
        uint256 _campaignId,
        string memory _title,
        string memory _description,
        string memory _longDescription,
        string memory _instructor,
        string[] memory _objectives,
        string[] memory _prerequisites,
        string memory _category,
        string memory _level,
        string memory _thumbnailUrl,
        string memory _duration,
        uint256 _totalLessons
    ) external onlyOwner {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        Campaign storage c = _campaigns[_campaignId];
        if (!c.isActive) revert CampaignNotActive();

        c.title = _title;
        c.description = _description;
        c.longDescription = _longDescription;
        c.instructor = _instructor;
        c.objectives = _objectives;
        c.prerequisites = _prerequisites;
        c.category = _category;
        c.level = _level;
        c.thumbnailUrl = _thumbnailUrl;
        c.duration = _duration;
        c.totalLessons = _totalLessons;

        emit CampaignUpdated(_campaignId, _title);
    }

    function deactivateCampaign(uint256 _campaignId) external onlyOwner {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        _campaigns[_campaignId].isActive = false;
        emit CampaignDeactivated(_campaignId);
    }

    // ============ ENROLLMENT & COMPLETION ============

    /// @notice Enroll a user in a campaign (open to anyone)
    function enroll(uint256 _campaignId, address _user) external {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        if (!_campaigns[_campaignId].isActive) revert CampaignNotActive();
        if (isEnrolled[_user][_campaignId]) revert AlreadyEnrolled();
        if (hasCompleted[_user][_campaignId]) revert AlreadyCompleted();

        isEnrolled[_user][_campaignId] = true;
        if (!_isParticipant[_campaignId][_user]) {
            _participants[_campaignId].push(_user);
            _isParticipant[_campaignId][_user] = true;
        }

        emit UserEnrolled(_user, _campaignId);
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
}
