// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface AssertionCallbackRecipient {
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;
    function assertionDisputedCallback(bytes32 assertionId) external;
}

contract MockOptimisticOracleV3 {
    using SafeERC20 for IERC20;

    bytes32 public immutable defaultIdentifier;
    uint256 public minimumBond;
    uint256 public assertionCount;

    struct Assertion {
        address asserter;
        address callbackRecipient;
        IERC20 currency;
        uint256 bond;
        bool result;
        bool disputed;
        bool settled;
    }

    mapping(bytes32 => Assertion) public assertions;

    event TruthAsserted(bytes32 indexed assertionId, address indexed asserter, address indexed callbackRecipient);
    event TruthDisputed(bytes32 indexed assertionId);
    event TruthSettled(bytes32 indexed assertionId, bool result);

    constructor(uint256 minimumBond_) {
        defaultIdentifier = keccak256("ASSERT_TRUTH");
        minimumBond = minimumBond_;
    }

    function setMinimumBond(uint256 minimumBond_) external {
        minimumBond = minimumBond_;
    }

    function setAssertionResult(bytes32 assertionId, bool result) external {
        require(assertions[assertionId].callbackRecipient != address(0), "unknown assertion");
        assertions[assertionId].result = result;
    }

    function getMinimumBond(address) external view returns (uint256) {
        return minimumBond;
    }

    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address,
        uint64,
        IERC20 currency,
        uint256 bond,
        bytes32,
        bytes32
    ) external returns (bytes32 assertionId) {
        assertionCount += 1;
        assertionId = keccak256(abi.encode(claim, asserter, callbackRecipient, block.chainid, address(this), assertionCount));
        if (bond > 0) currency.safeTransferFrom(msg.sender, address(this), bond);
        assertions[assertionId] = Assertion({
            asserter: asserter,
            callbackRecipient: callbackRecipient,
            currency: currency,
            bond: bond,
            result: true,
            disputed: false,
            settled: false
        });
        emit TruthAsserted(assertionId, asserter, callbackRecipient);
    }

    function disputeAssertion(bytes32 assertionId) external {
        Assertion storage assertion = assertions[assertionId];
        require(assertion.callbackRecipient != address(0), "unknown assertion");
        assertion.disputed = true;
        AssertionCallbackRecipient(assertion.callbackRecipient).assertionDisputedCallback(assertionId);
        emit TruthDisputed(assertionId);
    }

    function settleAndGetAssertionResult(bytes32 assertionId) external returns (bool) {
        Assertion storage assertion = assertions[assertionId];
        require(assertion.callbackRecipient != address(0), "unknown assertion");
        require(!assertion.settled, "settled");
        assertion.settled = true;
        AssertionCallbackRecipient(assertion.callbackRecipient).assertionResolvedCallback(assertionId, assertion.result);
        emit TruthSettled(assertionId, assertion.result);
        return assertion.result;
    }
}
