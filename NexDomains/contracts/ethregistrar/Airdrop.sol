// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Airdrop is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // point accounting
    mapping(address => uint256) private points;
    mapping(address => bool) private isMinter; // prevents duplicates in minters array
    address[] private minters; // list of users with >0 points
    uint256 public totalPoints;
    mapping(address => bool) public controllers;

    // configurable cap: optionally limit total points
    uint256 public pointsCap = 1_000_000;

    // events
    event PointsUpdated(
        address indexed user,
        uint256 added,
        uint256 newBalance
    );
    event PointsBatchUpdated(uint256 count);
    event PointsCapUpdated(uint256 newCap);
    event TokensDistributed(address indexed token, uint256 totalAmount);
    event EmergencyWithdraw(address token, address to, uint256 amount);

    constructor() {
        // Ownable sets owner = msg.sender automatically
    }

    // ------------------------
    // Owner functions
    // ------------------------

    modifier onlyController {
        require(controllers[msg.sender] == true, "Not a Controller");
        _;
    }

    function setController(address controller) external {
        controllers[controller] = true;
    }

    /// @notice update points for a single user
    function updatePoints(address user, uint256 addPoints) external onlyController {
        require(user != address(0), "bad addr");
        require(addPoints > 0, "zero points");
        if (totalPoints + addPoints <= pointsCap) {
            uint256 prev = points[user];
            points[user] = prev + addPoints;
            totalPoints += addPoints;

            // if this is the user's first time, add to minters list
            if (!isMinter[user]) {
                isMinter[user] = true;
                minters.push(user);
            }
            emit PointsUpdated(user, addPoints, points[user]);
        }
    }

    /// @notice batch update (addresses[] and points[] must match length)
    function batchUpdatePoints(
        address[] calldata users,
        uint256[] calldata addPoints
    ) external onlyController {
        require(users.length == addPoints.length, "len mismatch");
        uint256 len = users.length;
        uint256 sum = 0;

        for (uint256 i = 0; i < len; i++) {
            address u = users[i];
            uint256 v = addPoints[i];
            require(u != address(0), "bad addr");
            require(v > 0, "zero points");
            // defensive check to avoid overflow on cap
            require(totalPoints + sum + v <= pointsCap, "cap exceeded");

            uint256 prev = points[u];
            points[u] = prev + v;
            if (!isMinter[u]) {
                isMinter[u] = true;
                minters.push(u);
            }
            sum += v;
            emit PointsUpdated(u, v, points[u]);
        }

        totalPoints += sum;
        emit PointsBatchUpdated(len);
    }

    function setPointsCap(uint256 newCap) external onlyOwner {
        pointsCap = newCap;
        emit PointsCapUpdated(newCap);
    }

    // ------------------------
    // Distribution (caution: gas heavy)
    // ------------------------

    /**
     * @notice distribute `amount` of `token` to all recorded minters proportionally to their points.
     * @dev This loops over minters[] and will fail/gas out if minters array is huge.
     * Use Merkle airdrop for large lists (recommended).
     */
    function distributeERC20(
        address token,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(amount > 0, "zero amount");
        require(totalPoints > 0, "no points");
        IERC20 erc = IERC20(token);

        // pull tokens from owner/treasury into this contract first (or owner must have approved this contract)
        // safer pattern: require that contract already has `amount` balance
        uint256 balance = erc.balanceOf(address(this));
        require(balance >= amount, "insufficient contract balance");

        uint256 len = minters.length;
        for (uint256 i = 0; i < len; i++) {
            address user = minters[i];
            uint256 userPoints = points[user];
            if (userPoints == 0) continue; // should not happen, but defensive
            uint256 share = (amount * userPoints) / totalPoints;
            if (share > 0) {
                erc.safeTransfer(user, share);
            }
        }

        emit TokensDistributed(token, amount);
    }

    // ------------------------
    // Views
    // ------------------------

    function getTotalPoints() external view returns (uint256) {
        return totalPoints;
    }

    function getUserPoints(address user) external view returns (uint256) {
        return points[user];
    }

    function getAllUsers() external view returns (address[] memory) {
        return minters;
    }

    function getAllUserPoints(
        address[] calldata users
    ) external view returns (uint256[] memory) {
        uint256[] memory _points = new uint256[](users.length);
        for (uint256 i = 0; i < users.length; i++) {
            _points[i] = points[users[i]];
        }
        return _points;
    }

    // ------------------------
    // Emergency / admin
    // ------------------------

    /// @notice withdraw any ERC20 accidentally sent to contract (owner only)
    function emergencyWithdrawERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "bad to");
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }

    /// @notice withdraw native balance
    function emergencyWithdrawBNB(
        address payable to,
        uint256 amount
    ) external onlyOwner {
        require(to != payable(address(0)), "bad to");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit EmergencyWithdraw(address(0), to, amount);
    }

    // fallback receive
    receive() external payable {}
}
