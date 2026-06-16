// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface INativeTargetMarket {
    function quoteBuy(uint8 side, uint256 notional) external view returns (uint256 fee, uint256 shares, uint256 priceBps);
    function currentPriceBps(uint8 side) external view returns (uint256);
    function buyFor(uint8 side, uint256 notional, address recipient, uint256 maxPriceBps) external;
}

contract NativeTargetOrderExecutor is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    enum Status {
        Open,
        Executed,
        Cancelled,
        Expired
    }

    struct TargetOrder {
        address owner;
        address market;
        uint8 side;
        uint256 notional;
        uint256 maxPriceBps;
        uint256 deposited;
        uint64 expiresAt;
        Status status;
    }

    IERC20 public immutable collateral;
    uint256 public nextOrderId = 1;
    mapping(uint256 => TargetOrder) public orders;

    event TargetOrderCreated(
        uint256 indexed orderId,
        address indexed owner,
        address indexed market,
        uint8 side,
        uint256 notional,
        uint256 maxPriceBps,
        uint256 deposited,
        uint64 expiresAt
    );
    event TargetOrderExecuted(uint256 indexed orderId, address indexed owner, address indexed market, bytes32 marker);
    event TargetOrderCancelled(uint256 indexed orderId, address indexed owner, uint256 refund);
    event TargetOrderExpired(uint256 indexed orderId, address indexed owner, uint256 refund);

    constructor(IERC20 collateral_, address admin, address executor) {
        require(address(collateral_) != address(0), "collateral required");
        require(admin != address(0), "admin required");
        require(executor != address(0), "executor required");
        collateral = collateral_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(EXECUTOR_ROLE, executor);
        _grantRole(PAUSER_ROLE, admin);
    }

    function createOrder(
        address market,
        uint8 side,
        uint256 notional,
        uint256 maxPriceBps,
        uint64 expiresAt
    ) external nonReentrant whenNotPaused returns (uint256 orderId) {
        require(market != address(0), "market required");
        require(side <= 1, "bad side");
        require(notional > 0, "notional required");
        require(maxPriceBps >= 100 && maxPriceBps <= 9_900, "bad target");
        require(expiresAt == 0 || expiresAt > block.timestamp, "expired");

        _assertMarketSupportsTargets(market, side, maxPriceBps);
        (uint256 fee, , ) = INativeTargetMarket(market).quoteBuy(side, notional);
        uint256 requiredDeposit = notional + fee;
        collateral.safeTransferFrom(msg.sender, address(this), requiredDeposit);

        orderId = nextOrderId++;
        orders[orderId] = TargetOrder({
            owner: msg.sender,
            market: market,
            side: side,
            notional: notional,
            maxPriceBps: maxPriceBps,
            deposited: requiredDeposit,
            expiresAt: expiresAt,
            status: Status.Open
        });

        emit TargetOrderCreated(orderId, msg.sender, market, side, notional, maxPriceBps, requiredDeposit, expiresAt);
    }

    function cancelOrder(uint256 orderId) external nonReentrant {
        TargetOrder storage order = orders[orderId];
        require(order.owner == msg.sender, "not owner");
        require(order.status == Status.Open, "not open");
        order.status = Status.Cancelled;
        uint256 refund = order.deposited;
        order.deposited = 0;
        collateral.safeTransfer(order.owner, refund);
        emit TargetOrderCancelled(orderId, order.owner, refund);
    }

    function expireOrder(uint256 orderId) external nonReentrant {
        TargetOrder storage order = orders[orderId];
        require(order.status == Status.Open, "not open");
        require(order.expiresAt != 0 && block.timestamp >= order.expiresAt, "not expired");
        order.status = Status.Expired;
        uint256 refund = order.deposited;
        order.deposited = 0;
        collateral.safeTransfer(order.owner, refund);
        emit TargetOrderExpired(orderId, order.owner, refund);
    }

    function executeOrder(uint256 orderId) external nonReentrant whenNotPaused onlyRole(EXECUTOR_ROLE) {
        TargetOrder storage order = orders[orderId];
        require(order.status == Status.Open, "not open");
        require(order.expiresAt == 0 || block.timestamp < order.expiresAt, "expired");

        INativeTargetMarket market = INativeTargetMarket(order.market);
        uint256 priceBps = market.currentPriceBps(order.side);
        require(priceBps <= order.maxPriceBps, "target not reached");

        (uint256 fee, , ) = market.quoteBuy(order.side, order.notional);
        uint256 requiredAmount = order.notional + fee;
        require(order.deposited >= requiredAmount, "deposit short");

        order.status = Status.Executed;
        uint256 refund = order.deposited - requiredAmount;
        order.deposited = 0;

        collateral.forceApprove(order.market, requiredAmount);
        market.buyFor(order.side, order.notional, order.owner, order.maxPriceBps);
        collateral.forceApprove(order.market, 0);

        if (refund > 0) collateral.safeTransfer(order.owner, refund);
        emit TargetOrderExecuted(orderId, order.owner, order.market, bytes32(0));
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _assertMarketSupportsTargets(address market, uint8 side, uint256 maxPriceBps) private {
        try INativeTargetMarket(market).buyFor(side, 0, msg.sender, maxPriceBps) {
            revert("bad target market");
        } catch Error(string memory reason) {
            require(keccak256(bytes(reason)) == keccak256(bytes("notional required")), "target unsupported");
        } catch {
            revert("target unsupported");
        }
    }
}
