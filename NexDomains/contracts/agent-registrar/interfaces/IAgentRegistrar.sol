// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ReferralVerifier} from "../../ethregistrar/ReferralVerifier.sol";

/**
 * @title IAgentRegistrar
 * @notice Interface for the agent registrar controller
 * @dev Supports USDC-only payments, ERC-4337 Account Abstraction,
 *      Circle Paymaster for gasless transactions, and optional AA wallet deployment
 */
interface IAgentRegistrar {
    /**
     * @notice Registration request structure
     */
    struct RegisterRequest {
        string name; // Name to register (without .id suffix)
        address owner; // Owner of the registered name
        bytes32 secret; // Secret for commit-reveal (can be zero for agent names in agent mode)
        address resolver; // Resolver address to set
        bytes[] data; // Resolver data to set during registration
        bool reverseRecord; // Whether to set reverse record
        uint16 ownerControlledFuses; // Fuses to set on the wrapped name
        bool deployWallet; // Whether to deploy an AA wallet for the agent
        uint256 walletSalt; // Salt for deterministic AA wallet address (CREATE2)
    }

    /**
     * @notice EIP-2612 permit data for gasless USDC approval
     */
    struct PermitData {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /**
     * @notice Emitted when a name is registered
     */
    event NameRegistered(
        string name,
        bytes32 indexed label,
        address indexed owner,
        uint256 cost,
        uint256 expires
    );

    /**
     * @notice Emitted when a batch registration completes
     */
    event BatchRegistered(
        uint256 count,
        address indexed owner,
        uint256 totalCost
    );

    /**
     * @notice Emitted when an AA wallet is deployed for an agent
     */
    event AgentWalletDeployed(
        address indexed owner,
        address indexed wallet,
        string domainName
    );

    /**
     * @notice Register a name with ETH payment
     * @param req The registration request
     * @param referralData The referral data
     * @param referralSignature The referral signature
     */
    function register(
        RegisterRequest calldata req,
        ReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature
    ) external payable;

    /**
     * @notice Register a name with USDC payment
     * @param req The registration request
     * @param referralData The referral data
     * @param referralSignature The referral signature
     */
    function registerWithUSDC(
        RegisterRequest calldata req,
        ReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature
    ) external;

    /**
     * @notice Register a name with USDC using EIP-2612 permit (gasless approval)
     * @dev Best for AA wallets - single transaction approval + mint
     * @param req The registration request
     * @param permit EIP-2612 permit data for USDC approval
     * @param referralData The referral data
     * @param referralSignature The referral signature
     */
    function registerWithPermit(
        RegisterRequest calldata req,
        PermitData calldata permit,
        ReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature
    ) external;

    /**
     * @notice Batch register names with USDC (agent names only)
     * @param requests Array of registration requests
     */
    function batchRegisterWithUSDC(
        RegisterRequest[] calldata requests
    ) external;

    /**
     * @notice Register multiple names in a single transaction
     * @param requests Array of registration requests
     */
    function batchRegister(
        RegisterRequest[] calldata requests
    ) external payable;

    /**
     * @notice Commit to a name registration (for commit-reveal)
     * @param commitment The commitment hash
     */
    function commit(bytes32 commitment) external;

    /**
     * @notice Make a commitment hash from registration parameters
     * @param req The registration request
     * @return The commitment hash
     */
    function makeCommitment(
        RegisterRequest calldata req
    ) external pure returns (bytes32);

    /**
     * @notice Check if a name is available for registration
     * @param name The name to check
     * @return True if the name is available
     */
    function available(string calldata name) external view returns (bool);

    /**
     * @notice Check if a name is valid (meets minimum requirements)
     * @param name The name to check
     * @return True if the name is valid
     */
    function valid(string calldata name) external pure returns (bool);

    /**
     * @notice Get registration price in USDC (6 decimals)
     * @param name The name to price
     * @return priceUSDC Price in USDC (6 decimals)
     * @return isAgentName Whether the name qualifies as an agent name
     */
    function getPrice(
        string calldata name
    ) external view returns (uint256 priceUSDC, bool isAgentName);

    /**
     * @notice Get the deterministic AA wallet address for an owner
     * @param owner The wallet owner
     * @param salt The CREATE2 salt
     * @return The predicted wallet address
     */
    function getWalletAddress(
        address owner,
        uint256 salt
    ) external view returns (address);
}
