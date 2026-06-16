// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FeeRouter} from "./FeeRouter.sol";

contract NativeBinaryMarket is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant RESOLUTION_ROLE = keccak256("RESOLUTION_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant PRICE_BPS_DENOMINATOR = 10_000;
    uint256 public constant VIRTUAL_SHARES = 100_000_000;
    uint256 public constant EARLY_EXPOSURE_WINDOW = 1 hours;

    enum Side {
        Ride,
        Fade
    }

    enum Status {
        LivePendingOpen,
        TradingLive,
        Closed,
        ResultProposed,
        Disputed,
        Settled,
        InvalidRefund,
        CancelledBeforeTrading
    }

    IERC20 public immutable collateral;
    FeeRouter public immutable feeRouter;
    address public immutable creator;
    bytes32 public immutable rulesHash;
    bytes32 public immutable metadataHash;
    bytes32 public immutable stakeId;
    uint256 public immutable openAt;
    uint256 public immutable closeTime;
    uint256 public immutable earlyExposureCap;

    Status public status;
    Side public proposedWinner;
    Side public finalWinner;
    uint256 public collateralPool;
    uint256 public settlementPool;
    uint256 public rideSharesTotal;
    uint256 public fadeSharesTotal;
    bool public finalWinnerSet;

    mapping(address => uint256) public rideShares;
    mapping(address => uint256) public fadeShares;
    mapping(address => uint256) public rideCollateral;
    mapping(address => uint256) public fadeCollateral;
    mapping(address => uint256) public refundedCollateral;
    mapping(address => uint256) public userExposure;

    event TradeExecuted(address indexed trader, Side indexed side, uint256 notional, uint256 fee, uint256 shares);
    event TradeSold(address indexed trader, Side indexed side, uint256 shares, uint256 notional, uint256 fee, uint256 payout);
    event MarketOpened(uint256 openedAt);
    event MarketClosed(uint256 closedAt);
    event ResultProposed(Side indexed winner);
    event ResultDisputed();
    event MarketSettled(Side indexed winner, uint256 settlementPool);
    event MarketInvalidated(uint256 refundPool);
    event Redeemed(address indexed trader, uint256 amount);
    event Refunded(address indexed trader, uint256 amount);

    constructor(
        IERC20 collateral_,
        FeeRouter feeRouter_,
        address admin,
        address creator_,
        bytes32 rulesHash_,
        bytes32 metadataHash_,
        bytes32 stakeId_,
        uint256 openAt_,
        uint256 closeTime_,
        uint256 earlyExposureCap_
    ) {
        require(address(collateral_) != address(0), "collateral required");
        require(address(feeRouter_) != address(0), "fee router required");
        require(admin != address(0), "admin required");
        require(creator_ != address(0), "creator required");
        require(rulesHash_ != bytes32(0), "rules hash required");
        require(metadataHash_ != bytes32(0), "metadata hash required");
        require(closeTime_ > openAt_, "bad close time");

        collateral = collateral_;
        feeRouter = feeRouter_;
        creator = creator_;
        rulesHash = rulesHash_;
        metadataHash = metadataHash_;
        stakeId = stakeId_;
        openAt = openAt_;
        closeTime = closeTime_;
        earlyExposureCap = earlyExposureCap_;
        status = Status.LivePendingOpen;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESOLUTION_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function buy(Side side, uint256 notional) external nonReentrant whenNotPaused {
        _buy(side, notional, msg.sender, msg.sender, 0);
    }

    function buyFor(Side side, uint256 notional, address recipient, uint256 maxPriceBps) external nonReentrant whenNotPaused {
        require(recipient != address(0), "recipient required");
        _buy(side, notional, msg.sender, recipient, maxPriceBps);
    }

    function _buy(Side side, uint256 notional, address payer, address recipient, uint256 maxPriceBps) private {
        _openIfReady();
        require(status == Status.TradingLive, "not trading");
        require(block.timestamp < closeTime, "market closed");
        require(notional > 0, "notional required");

        if (earlyExposureCap > 0 && block.timestamp < openAt + EARLY_EXPOSURE_WINDOW) {
            require(userExposure[recipient] + notional <= earlyExposureCap, "exposure cap");
            userExposure[recipient] += notional;
        }

        (uint256 fee, uint256 shares, uint256 priceBps) = quoteBuy(side, notional);
        if (maxPriceBps > 0) {
            require(priceBps <= maxPriceBps, "target price missed");
        }

        collateralPool += notional;
        if (side == Side.Ride) {
            rideShares[recipient] += shares;
            rideCollateral[recipient] += notional;
            rideSharesTotal += shares;
        } else {
            fadeShares[recipient] += shares;
            fadeCollateral[recipient] += notional;
            fadeSharesTotal += shares;
        }

        collateral.safeTransferFrom(payer, address(this), notional + fee);
        collateral.forceApprove(address(feeRouter), fee);
        uint256 routedFee = feeRouter.routeTradeFee(collateral, creator, notional);
        require(routedFee == fee, "fee mismatch");

        emit TradeExecuted(recipient, side, notional, fee, shares);
    }

    function sell(Side side, uint256 shares) external nonReentrant whenNotPaused {
        _openIfReady();
        require(status == Status.TradingLive, "not trading");
        require(block.timestamp < closeTime, "market closed");
        require(shares > 0, "shares required");

        uint256 owned = side == Side.Ride ? rideShares[msg.sender] : fadeShares[msg.sender];
        require(owned >= shares, "insufficient shares");

        (uint256 fee, uint256 notional, uint256 payout, ) = quoteSell(side, shares);
        require(notional <= collateralPool, "insufficient pool");

        if (side == Side.Ride) {
            rideShares[msg.sender] -= shares;
            rideSharesTotal -= shares;
            _reduceRefundableCollateral(rideCollateral, msg.sender, notional);
        } else {
            fadeShares[msg.sender] -= shares;
            fadeSharesTotal -= shares;
            _reduceRefundableCollateral(fadeCollateral, msg.sender, notional);
        }

        collateralPool -= notional;
        collateral.forceApprove(address(feeRouter), fee);
        uint256 routedFee = feeRouter.routeTradeFee(collateral, creator, notional);
        require(routedFee == fee, "fee mismatch");
        collateral.safeTransfer(msg.sender, payout);

        emit TradeSold(msg.sender, side, shares, notional, fee, payout);
    }

    function closeMarket() external onlyRole(RESOLUTION_ROLE) {
        _openIfReady();
        require(status == Status.TradingLive || status == Status.LivePendingOpen, "cannot close");
        if (status == Status.LivePendingOpen) {
            status = Status.CancelledBeforeTrading;
        } else {
            status = Status.Closed;
        }
        emit MarketClosed(block.timestamp);
    }

    function proposeResult(Side winner) external onlyRole(RESOLUTION_ROLE) {
        require(status == Status.Closed, "not closed");
        proposedWinner = winner;
        status = Status.ResultProposed;
        emit ResultProposed(winner);
    }

    function markDisputed() external onlyRole(RESOLUTION_ROLE) {
        require(status == Status.ResultProposed, "not proposed");
        status = Status.Disputed;
        emit ResultDisputed();
    }

    function finalizeResult(Side winner, bool invalid) external onlyRole(RESOLUTION_ROLE) {
        require(status == Status.ResultProposed || status == Status.Disputed || status == Status.Closed, "cannot finalize");
        if (invalid) {
            status = Status.InvalidRefund;
            emit MarketInvalidated(collateralPool);
            return;
        }
        finalWinner = winner;
        finalWinnerSet = true;
        settlementPool = collateralPool;
        status = Status.Settled;
        emit MarketSettled(winner, settlementPool);
    }

    function redeem() external nonReentrant {
        require(status == Status.Settled && finalWinnerSet, "not settled");
        uint256 shares = finalWinner == Side.Ride ? rideShares[msg.sender] : fadeShares[msg.sender];
        require(shares > 0, "no winning shares");

        if (finalWinner == Side.Ride) {
            rideShares[msg.sender] = 0;
            rideSharesTotal -= shares;
            rideCollateral[msg.sender] = 0;
        } else {
            fadeShares[msg.sender] = 0;
            fadeSharesTotal -= shares;
            fadeCollateral[msg.sender] = 0;
        }

        uint256 totalWinnerShares = finalWinner == Side.Ride ? rideSharesTotal : fadeSharesTotal;
        uint256 payout = totalWinnerShares + shares == 0 ? 0 : (settlementPool * shares) / (totalWinnerShares + shares);
        settlementPool -= payout;
        collateralPool -= payout;
        collateral.safeTransfer(msg.sender, payout);
        emit Redeemed(msg.sender, payout);
    }

    function refund(Side side) external nonReentrant {
        require(status == Status.InvalidRefund || status == Status.CancelledBeforeTrading, "refund unavailable");
        uint256 amount;
        if (side == Side.Ride) {
            amount = rideCollateral[msg.sender];
            rideSharesTotal -= rideShares[msg.sender];
            rideShares[msg.sender] = 0;
            rideCollateral[msg.sender] = 0;
        } else {
            amount = fadeCollateral[msg.sender];
            fadeSharesTotal -= fadeShares[msg.sender];
            fadeShares[msg.sender] = 0;
            fadeCollateral[msg.sender] = 0;
        }
        require(amount > 0, "nothing to refund");
        refundedCollateral[msg.sender] += amount;
        collateralPool -= amount;
        collateral.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _openIfReady() private {
        if (status == Status.LivePendingOpen && block.timestamp >= openAt) {
            status = Status.TradingLive;
            emit MarketOpened(block.timestamp);
        }
    }

    function _reduceRefundableCollateral(mapping(address => uint256) storage refundable, address trader, uint256 notional) private {
        uint256 current = refundable[trader];
        refundable[trader] = notional >= current ? 0 : current - notional;
    }

    function quoteBuy(Side side, uint256 notional) public view returns (uint256 fee, uint256 shares, uint256 priceBps) {
        require(notional > 0, "notional required");
        priceBps = currentPriceBps(side);
        fee = feeRouter.expectedFee(notional);
        shares = (notional * PRICE_BPS_DENOMINATOR) / priceBps;
    }

    function quoteSell(Side side, uint256 shares) public view returns (uint256 fee, uint256 notional, uint256 payout, uint256 priceBps) {
        require(shares > 0, "shares required");
        priceBps = currentPriceBps(side);
        notional = (shares * priceBps) / PRICE_BPS_DENOMINATOR;
        if (notional > collateralPool) notional = collateralPool;
        fee = feeRouter.expectedFee(notional);
        payout = notional > fee ? notional - fee : 0;
    }

    function currentPriceBps(Side side) public view returns (uint256) {
        uint256 sideShares = side == Side.Ride ? rideSharesTotal : fadeSharesTotal;
        uint256 oppositeShares = side == Side.Ride ? fadeSharesTotal : rideSharesTotal;
        uint256 price = ((sideShares + VIRTUAL_SHARES) * PRICE_BPS_DENOMINATOR) / (sideShares + oppositeShares + (2 * VIRTUAL_SHARES));
        if (price < 100) return 100;
        if (price > 9_900) return 9_900;
        return price;
    }
}
