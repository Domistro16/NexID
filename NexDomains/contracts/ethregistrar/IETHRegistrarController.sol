// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IPriceOracle} from "./IPriceOracle.sol";
import {ReferralVerifier} from "./ReferralVerifier.sol";

interface IETHRegistrarController {
    // ============ Structs ============
    struct RegisterRequest {
        string name;
        address owner;
        uint256 duration;
        bytes32 secret;
        address resolver;
        bytes[] data;
        bool reverseRecord;
        uint16 ownerControlledFuses;
        bool lifetime;
    }

    // ============ View Functions ============
    function rentPrice(
        string memory name,
        uint256 duration,
        bool lifetime
    ) external view returns (IPriceOracle.Price memory);

    function available(string memory name) external view returns (bool);

    function makeCommitment(
        RegisterRequest calldata req
    ) external pure returns (bytes32);

    function commit(bytes32 commitment) external;

    // ============ Registration (requires referral signature) ============

    function register(
        RegisterRequest calldata req,
        ReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature
    ) external payable;

    function registerWithToken(
        RegisterRequest calldata req,
        address tokenAddress,
        ReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature
    ) external;

    // ============ Renewal (NO referral params - auto-pays stored referrer) ============

    function renew(
        string calldata name,
        uint256 duration,
        bool lifetime
    ) external payable;

    function renewTokens(
        string calldata name,
        uint256 duration,
        address tokenAddress,
        bool lifetime
    ) external;
}
