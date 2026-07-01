// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockReferralVerifier {
    using SafeERC20 for IERC20;

    uint256 public constant BASE_PCT = 25;
    uint256 public constant BONUS_PCT = 30;
    uint256 public constant BONUS_THRESHOLD = 5;

    struct ReferralData {
        address referrer;
        address registrant;
        bytes32 nameHash;
        bytes32 referrerCodeHash;
        uint256 deadline;
        bytes32 nonce;
    }

    mapping(address => uint256) public referralCount;
    mapping(address => uint256) public totalEarnings;

    event ReferralPaid(
        address indexed referrer,
        address indexed registrant,
        bytes32 indexed nameHash,
        uint256 amount,
        address token,
        bool isFiat
    );

    function processReferral(
        ReferralData calldata data,
        bytes calldata signature,
        uint256 totalPrice,
        address token,
        bool isFiat
    ) external payable returns (uint256 paidAmount) {
        require(data.referrer != address(0), "missing referrer");
        require(data.referrer != data.registrant, "self referral");
        require(signature.length > 0, "missing signature");
        require(block.timestamp <= data.deadline, "expired");
        require(token != address(0), "token required");
        require(!isFiat, "fiat unsupported");

        uint256 pct = referralCount[data.referrer] >= BONUS_THRESHOLD ? BONUS_PCT : BASE_PCT;
        paidAmount = (totalPrice * pct) / 100;
        referralCount[data.referrer]++;
        totalEarnings[data.referrer] += paidAmount;

        IERC20 paymentToken = IERC20(token);
        paymentToken.safeTransfer(data.referrer, paidAmount);
        uint256 excess = paymentToken.balanceOf(address(this));
        if (excess > 0) {
            paymentToken.safeTransfer(msg.sender, excess);
        }

        emit ReferralPaid(data.referrer, data.registrant, data.nameHash, paidAmount, token, isFiat);
    }
}
