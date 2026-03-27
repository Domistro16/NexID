// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PartnerCampaigns
 * @notice Plan-aware campaign registry with on-chain points tracking.
 * @dev Ranking is still computed off-chain for gas efficiency, but the campaign
 *      lifecycle is now derived from the selected plan so the webapp and
 *      contracts share the same timing and winner-cap rules.
 */
contract PartnerCampaigns is Ownable {
    enum CampaignPlan {
        LAUNCH_SPRINT,
        DEEP_DIVE,
        CUSTOM
    }

    enum LeaderboardMode {
        FIXED,
        ROLLING_MONTHLY
    }

    struct Campaign {
        uint256 id;
        string title;
        string description;
        string category;
        string level;
        string thumbnailUrl;
        uint256 totalTasks;
        address sponsor;
        string sponsorName;
        string sponsorLogo;
        uint256 prizePool;
        uint256 startTime;
        uint256 endTime;
        uint256 durationDays;
        uint256 winnerCap;
        uint256 payoutRounds;
        uint256 payoutIntervalDays;
        CampaignPlan plan;
        LeaderboardMode leaderboardMode;
        bool isActive;
    }

    uint256 private constant LAUNCH_SPRINT_DURATION = 7 days;
    uint256 private constant DEEP_DIVE_DURATION = 30 days;
    uint256 private constant CUSTOM_DURATION = 180 days;
    uint256 private constant CUSTOM_MIN_WINNER_CAP = 10;
    uint256 private constant LAUNCH_SPRINT_WINNER_CAP = 150;
    uint256 private constant DEEP_DIVE_WINNER_CAP = 500;

    uint256 public campaignCounter;
    address public relayer;

    mapping(uint256 => Campaign) internal _campaigns;
    mapping(address => mapping(uint256 => bool)) public isEnrolled;
    mapping(address => mapping(uint256 => bool)) public hasCompleted;
    mapping(uint256 => mapping(address => uint256)) public campaignPoints;
    mapping(uint256 => uint256) public totalCampaignPoints;
    mapping(uint256 => address[]) internal _participants;
    mapping(uint256 => mapping(address => bool)) internal _isParticipant;

    event CampaignCreated(
        uint256 indexed campaignId,
        CampaignPlan indexed plan,
        string title,
        address indexed sponsor,
        uint256 winnerCap,
        uint256 endTime
    );
    event CampaignUpdated(
        uint256 indexed campaignId,
        CampaignPlan indexed plan,
        string title,
        uint256 winnerCap,
        uint256 endTime
    );
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
    error CampaignNotStarted();
    error CampaignEnded();
    error AlreadyEnrolled();
    error NotEnrolled();
    error AlreadyCompleted();
    error LengthMismatch();
    error InvalidAddress();
    error InvalidWinnerCap();

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    constructor(address _owner) Ownable(_owner) {}

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
        uint256 _totalTasks,
        address _sponsor,
        string memory _sponsorName,
        string memory _sponsorLogo,
        uint256 _prizePool,
        uint256 _startTime,
        CampaignPlan _plan,
        uint256 _customWinnerCap
    ) external onlyOwner returns (uint256) {
        if (_sponsor == address(0)) revert InvalidAddress();

        uint256 id = campaignCounter++;
        Campaign storage c = _campaigns[id];

        _writeCampaign(
            c,
            id,
            _title,
            _description,
            _category,
            _level,
            _thumbnailUrl,
            _totalTasks,
            _sponsor,
            _sponsorName,
            _sponsorLogo,
            _prizePool,
            _startTime,
            _plan,
            _customWinnerCap
        );

        emit CampaignCreated(
            id,
            c.plan,
            _title,
            _sponsor,
            c.winnerCap,
            c.endTime
        );
        return id;
    }

    function updateCampaign(
        uint256 _campaignId,
        string memory _title,
        string memory _description,
        string memory _category,
        string memory _level,
        string memory _thumbnailUrl,
        uint256 _totalTasks,
        address _sponsor,
        string memory _sponsorName,
        string memory _sponsorLogo,
        uint256 _prizePool,
        uint256 _startTime,
        CampaignPlan _plan,
        uint256 _customWinnerCap
    ) external onlyOwner {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        if (_sponsor == address(0)) revert InvalidAddress();

        Campaign storage c = _campaigns[_campaignId];
        _writeCampaign(
            c,
            _campaignId,
            _title,
            _description,
            _category,
            _level,
            _thumbnailUrl,
            _totalTasks,
            _sponsor,
            _sponsorName,
            _sponsorLogo,
            _prizePool,
            _startTime,
            _plan,
            _customWinnerCap
        );

        emit CampaignUpdated(
            _campaignId,
            c.plan,
            _title,
            c.winnerCap,
            c.endTime
        );
    }

    function deactivateCampaign(uint256 _campaignId) external onlyOwner {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        _campaigns[_campaignId].isActive = false;
        emit CampaignDeactivated(_campaignId);
    }

    function enroll(uint256 _campaignId, address _user) external {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        Campaign storage c = _campaigns[_campaignId];

        if (!c.isActive || !isCampaignLive(_campaignId)) revert CampaignNotActive();
        if (block.timestamp < c.startTime) revert CampaignNotStarted();
        if (block.timestamp >= c.endTime) revert CampaignEnded();
        if (isEnrolled[_user][_campaignId]) revert AlreadyEnrolled();
        if (hasCompleted[_user][_campaignId]) revert AlreadyCompleted();

        isEnrolled[_user][_campaignId] = true;
        if (!_isParticipant[_campaignId][_user]) {
            _participants[_campaignId].push(_user);
            _isParticipant[_campaignId][_user] = true;
        }

        emit UserEnrolled(_user, _campaignId);
    }

    function addPoints(
        uint256 _campaignId,
        address _user,
        uint256 _points
    ) external onlyRelayer {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        if (!_isParticipant[_campaignId][_user]) revert NotEnrolled();
        if (!isCampaignLive(_campaignId)) revert CampaignEnded();

        campaignPoints[_campaignId][_user] += _points;
        totalCampaignPoints[_campaignId] += _points;

        emit PointsAwarded(
            _campaignId,
            _user,
            _points,
            campaignPoints[_campaignId][_user]
        );
    }

    function batchAddPoints(
        uint256 _campaignId,
        address[] calldata _users,
        uint256[] calldata _points
    ) external onlyRelayer {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        if (_users.length != _points.length) revert LengthMismatch();
        if (!isCampaignLive(_campaignId)) revert CampaignEnded();

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

    function getCampaign(
        uint256 _campaignId
    ) external view returns (Campaign memory) {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        return _campaignView(_campaignId);
    }

    function getAllCampaigns() external view returns (Campaign[] memory) {
        Campaign[] memory all = new Campaign[](campaignCounter);
        for (uint256 i = 0; i < campaignCounter; i++) {
            all[i] = _campaignView(i);
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

    function isCampaignLive(uint256 _campaignId) public view returns (bool) {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        Campaign storage c = _campaigns[_campaignId];
        return
            c.isActive &&
            block.timestamp >= c.startTime &&
            block.timestamp < c.endTime;
    }

    function hasCampaignEnded(uint256 _campaignId) external view returns (bool) {
        if (_campaignId >= campaignCounter) revert CampaignNotFound();
        return block.timestamp >= _campaigns[_campaignId].endTime;
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

    function _campaignView(
        uint256 _campaignId
    ) internal view returns (Campaign memory) {
        Campaign storage c = _campaigns[_campaignId];
        return
            Campaign({
                id: c.id,
                title: c.title,
                description: c.description,
                category: c.category,
                level: c.level,
                thumbnailUrl: c.thumbnailUrl,
                totalTasks: c.totalTasks,
                sponsor: c.sponsor,
                sponsorName: c.sponsorName,
                sponsorLogo: c.sponsorLogo,
                prizePool: c.prizePool,
                startTime: c.startTime,
                endTime: c.endTime,
                durationDays: c.durationDays,
                winnerCap: c.winnerCap,
                payoutRounds: c.payoutRounds,
                payoutIntervalDays: c.payoutIntervalDays,
                plan: c.plan,
                leaderboardMode: c.leaderboardMode,
                isActive: c.isActive && isCampaignLive(_campaignId)
            });
    }

    function _writeCampaign(
        Campaign storage c,
        uint256 _campaignId,
        string memory _title,
        string memory _description,
        string memory _category,
        string memory _level,
        string memory _thumbnailUrl,
        uint256 _totalTasks,
        address _sponsor,
        string memory _sponsorName,
        string memory _sponsorLogo,
        uint256 _prizePool,
        uint256 _startTime,
        CampaignPlan _plan,
        uint256 _customWinnerCap
    ) internal {
        (
            uint256 durationSeconds,
            uint256 winnerCap,
            LeaderboardMode leaderboardMode,
            uint256 payoutRounds,
            uint256 payoutIntervalDays
        ) = _resolvePlan(_plan, _customWinnerCap);

        uint256 startTime = _startTime == 0 ? block.timestamp : _startTime;

        c.id = _campaignId;
        c.title = _title;
        c.description = _description;
        c.category = _category;
        c.level = _level;
        c.thumbnailUrl = _thumbnailUrl;
        c.totalTasks = _totalTasks;
        c.sponsor = _sponsor;
        c.sponsorName = _sponsorName;
        c.sponsorLogo = _sponsorLogo;
        c.prizePool = _prizePool;
        c.startTime = startTime;
        c.endTime = startTime + durationSeconds;
        c.durationDays = durationSeconds / 1 days;
        c.winnerCap = winnerCap;
        c.payoutRounds = payoutRounds;
        c.payoutIntervalDays = payoutIntervalDays;
        c.plan = _plan;
        c.leaderboardMode = leaderboardMode;
        c.isActive = true;
    }

    function _resolvePlan(
        CampaignPlan _plan,
        uint256 _customWinnerCap
    )
        internal
        pure
        returns (
            uint256 durationSeconds,
            uint256 winnerCap,
            LeaderboardMode leaderboardMode,
            uint256 payoutRounds,
            uint256 payoutIntervalDays
        )
    {
        if (_plan == CampaignPlan.LAUNCH_SPRINT) {
            return (
                LAUNCH_SPRINT_DURATION,
                LAUNCH_SPRINT_WINNER_CAP,
                LeaderboardMode.FIXED,
                1,
                7
            );
        }

        if (_plan == CampaignPlan.DEEP_DIVE) {
            return (
                DEEP_DIVE_DURATION,
                DEEP_DIVE_WINNER_CAP,
                LeaderboardMode.FIXED,
                1,
                30
            );
        }

        if (_customWinnerCap < CUSTOM_MIN_WINNER_CAP) revert InvalidWinnerCap();

        return (
            CUSTOM_DURATION,
            _customWinnerCap,
            LeaderboardMode.ROLLING_MONTHLY,
            6,
            30
        );
    }
}
