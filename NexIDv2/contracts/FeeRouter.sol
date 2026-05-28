// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract FeeRouter is AccessControl {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant NATIVE_TRADING_FEE_BPS = 200;
    uint256 public constant CREATOR_BPS = 100;
    uint256 public constant PROTOCOL_BPS = 60;
    uint256 public constant REWARDS_BPS = 20;
    uint256 public constant SECURITY_BPS = 20;

    address public protocolTreasury;
    address public rewardsPool;
    address public securityPool;

    event FeeRecipientsUpdated(address indexed protocolTreasury, address indexed rewardsPool, address indexed securityPool);
    event NativeTradeFeeRouted(
        address indexed market,
        address indexed creator,
        uint256 notional,
        uint256 creatorAmount,
        uint256 protocolAmount,
        uint256 rewardsAmount,
        uint256 securityAmount
    );

    constructor(address admin, address protocolTreasury_, address rewardsPool_, address securityPool_) {
        require(CREATOR_BPS + PROTOCOL_BPS + REWARDS_BPS + SECURITY_BPS == NATIVE_TRADING_FEE_BPS, "fee split mismatch");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setRecipients(protocolTreasury_, rewardsPool_, securityPool_);
    }

    function setRecipients(address protocolTreasury_, address rewardsPool_, address securityPool_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRecipients(protocolTreasury_, rewardsPool_, securityPool_);
    }

    function expectedFee(uint256 notional) public pure returns (uint256) {
        return (notional * NATIVE_TRADING_FEE_BPS) / BPS_DENOMINATOR;
    }

    function routeTradeFee(IERC20 token, address creator, uint256 notional) external returns (uint256 totalFee) {
        require(creator != address(0), "creator required");
        totalFee = expectedFee(notional);
        uint256 creatorAmount = (notional * CREATOR_BPS) / BPS_DENOMINATOR;
        uint256 protocolAmount = (notional * PROTOCOL_BPS) / BPS_DENOMINATOR;
        uint256 rewardsAmount = (notional * REWARDS_BPS) / BPS_DENOMINATOR;
        uint256 securityAmount = totalFee - creatorAmount - protocolAmount - rewardsAmount;

        token.safeTransferFrom(msg.sender, creator, creatorAmount);
        token.safeTransferFrom(msg.sender, protocolTreasury, protocolAmount);
        token.safeTransferFrom(msg.sender, rewardsPool, rewardsAmount);
        token.safeTransferFrom(msg.sender, securityPool, securityAmount);

        emit NativeTradeFeeRouted(msg.sender, creator, notional, creatorAmount, protocolAmount, rewardsAmount, securityAmount);
    }

    function _setRecipients(address protocolTreasury_, address rewardsPool_, address securityPool_) private {
        require(protocolTreasury_ != address(0), "protocol treasury required");
        require(rewardsPool_ != address(0), "rewards pool required");
        require(securityPool_ != address(0), "security pool required");
        protocolTreasury = protocolTreasury_;
        rewardsPool = rewardsPool_;
        securityPool = securityPool_;
        emit FeeRecipientsUpdated(protocolTreasury_, rewardsPool_, securityPool_);
    }
}
