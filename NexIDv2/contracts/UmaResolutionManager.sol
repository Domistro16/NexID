// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {LaunchStakeVault} from "./LaunchStakeVault.sol";
import {NativeBinaryMarket} from "./NativeBinaryMarket.sol";

interface OptimisticOracleV3Interface {
    function defaultIdentifier() external view returns (bytes32);
    function getMinimumBond(address currency) external view returns (uint256);
    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address escalationManager,
        uint64 liveness,
        IERC20 currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external returns (bytes32 assertionId);
    function settleAndGetAssertionResult(bytes32 assertionId) external returns (bool);
}

contract UmaResolutionManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant ASSERTER_ROLE = keccak256("ASSERTER_ROLE");

    OptimisticOracleV3Interface public immutable optimisticOracle;
    IERC20 public immutable assertionCurrency;
    LaunchStakeVault public immutable launchStakeVault;
    bytes32 public immutable defaultIdentifier;
    uint64 public assertionLiveness;

    struct MarketAssertion {
        address market;
        NativeBinaryMarket.Side winner;
        address asserter;
        bytes32 claimHash;
        bool invalid;
        bool disputed;
        bool resolved;
        bool assertedTruthfully;
    }

    mapping(bytes32 => MarketAssertion) public assertions;
    mapping(address => bytes32) public activeAssertionByMarket;

    event MarketClosed(address indexed market);
    event MarketResultAsserted(
        address indexed market,
        bytes32 indexed assertionId,
        NativeBinaryMarket.Side indexed winner,
        bool invalid,
        address asserter,
        bytes32 claimHash
    );
    event MarketResultDisputed(address indexed market, bytes32 indexed assertionId);
    event MarketResultResolved(address indexed market, bytes32 indexed assertionId, bool assertedTruthfully, bool invalid);
    event AssertionLivenessUpdated(uint64 liveness);

    constructor(
        address admin,
        LaunchStakeVault launchStakeVault_,
        OptimisticOracleV3Interface optimisticOracle_,
        IERC20 assertionCurrency_,
        uint64 assertionLiveness_
    ) {
        require(admin != address(0), "admin required");
        require(address(launchStakeVault_) != address(0), "stake vault required");
        require(address(optimisticOracle_) != address(0), "oracle required");
        require(address(assertionCurrency_) != address(0), "currency required");
        require(assertionLiveness_ > 0, "liveness required");

        launchStakeVault = launchStakeVault_;
        optimisticOracle = optimisticOracle_;
        assertionCurrency = assertionCurrency_;
        assertionLiveness = assertionLiveness_;
        defaultIdentifier = optimisticOracle_.defaultIdentifier();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESOLVER_ROLE, admin);
        _grantRole(ASSERTER_ROLE, admin);
    }

    function closeMarket(NativeBinaryMarket market) external onlyRole(RESOLVER_ROLE) nonReentrant {
        emit MarketClosed(address(market));
        market.closeMarket();
    }

    function setAssertionLiveness(uint64 assertionLiveness_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(assertionLiveness_ > 0, "liveness required");
        assertionLiveness = assertionLiveness_;
        emit AssertionLivenessUpdated(assertionLiveness_);
    }

    function assertMarketResult(
        NativeBinaryMarket market,
        NativeBinaryMarket.Side winner,
        bool invalid,
        bytes calldata claim
    ) external onlyRole(ASSERTER_ROLE) nonReentrant returns (bytes32 assertionId) {
        require(address(market) != address(0), "market required");
        require(claim.length >= 32, "claim too short");
        require(market.status() == NativeBinaryMarket.Status.Closed, "market not closed");
        require(activeAssertionByMarket[address(market)] == bytes32(0), "active assertion");

        uint256 bond = optimisticOracle.getMinimumBond(address(assertionCurrency));
        if (bond > 0) {
            assertionCurrency.safeTransferFrom(msg.sender, address(this), bond);
            assertionCurrency.forceApprove(address(optimisticOracle), bond);
        }

        assertionId = optimisticOracle.assertTruth(
            claim,
            msg.sender,
            address(this),
            address(0),
            assertionLiveness,
            assertionCurrency,
            bond,
            defaultIdentifier,
            bytes32(0)
        );

        assertions[assertionId] = MarketAssertion({
            market: address(market),
            winner: winner,
            asserter: msg.sender,
            claimHash: keccak256(claim),
            invalid: invalid,
            disputed: false,
            resolved: false,
            assertedTruthfully: false
        });
        activeAssertionByMarket[address(market)] = assertionId;

        emit MarketResultAsserted(address(market), assertionId, winner, invalid, msg.sender, keccak256(claim));
    }

    function settleAssertion(bytes32 assertionId) external returns (bool) {
        require(assertions[assertionId].market != address(0), "unknown assertion");
        return optimisticOracle.settleAndGetAssertionResult(assertionId);
    }

    function assertionDisputedCallback(bytes32 assertionId) external {
        require(msg.sender == address(optimisticOracle), "only oracle");
        MarketAssertion storage assertion = assertions[assertionId];
        require(assertion.market != address(0), "unknown assertion");
        assertion.disputed = true;
        emit MarketResultDisputed(assertion.market, assertionId);
    }

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        require(msg.sender == address(optimisticOracle), "only oracle");
        MarketAssertion storage assertion = assertions[assertionId];
        require(assertion.market != address(0), "unknown assertion");
        require(!assertion.resolved, "already resolved");

        assertion.resolved = true;
        assertion.assertedTruthfully = assertedTruthfully;
        activeAssertionByMarket[assertion.market] = bytes32(0);

        if (assertedTruthfully) {
            NativeBinaryMarket market = NativeBinaryMarket(assertion.market);
            if (assertion.invalid) {
                market.finalizeResult(assertion.winner, true);
                launchStakeVault.slashBond(market.stakeId(), "uma invalid market");
            } else {
                market.finalizeResult(assertion.winner, false);
                launchStakeVault.returnBond(market.stakeId());
            }
        }

        emit MarketResultResolved(assertion.market, assertionId, assertedTruthfully, assertion.invalid);
    }
}
