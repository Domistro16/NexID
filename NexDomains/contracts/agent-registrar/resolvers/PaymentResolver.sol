// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ResolverBase} from "../../resolvers/ResolverBase.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title IPaymentResolver
 * @notice Interface for the PaymentResolver profile
 */
interface IPaymentResolver {
    event X402EndpointChanged(bytes32 indexed node, string endpoint);
    event PaymentAddressChanged(
        bytes32 indexed node,
        uint256 chainId,
        address addr
    );
    event AgentMetadataChanged(bytes32 indexed node, string uri);
    event PaymentEnabledChanged(bytes32 indexed node, bool enabled);

    function x402Endpoint(bytes32 node) external view returns (string memory);
    function setX402Endpoint(bytes32 node, string calldata endpoint) external;
    function paymentAddress(
        bytes32 node,
        uint256 chainId
    ) external view returns (address);
    function setPaymentAddress(
        bytes32 node,
        uint256 chainId,
        address addr
    ) external;
    function agentMetadata(bytes32 node) external view returns (string memory);
    function setAgentMetadata(bytes32 node, string calldata uri) external;
    function paymentEnabled(bytes32 node) external view returns (bool);
    function setPaymentEnabled(bytes32 node, bool enabled) external;
    function supportedChains(
        bytes32 node
    ) external view returns (uint256[] memory);
}

/**
 * @title PaymentResolver
 * @notice Resolver profile for x402 protocol and ERC-8004 agent payments
 * @dev Implements payment endpoints, chain-specific payment addresses, and agent metadata
 */
abstract contract PaymentResolver is IPaymentResolver, ResolverBase {
    // ============ Storage ============

    /// @notice x402 payment endpoint per node
    mapping(bytes32 => string) private _x402Endpoints;

    /// @notice Payment address per node per chain
    mapping(bytes32 => mapping(uint256 => address)) private _paymentAddresses;

    /// @notice Agent metadata URI per node
    mapping(bytes32 => string) private _agentMetadata;

    /// @notice Whether payments are enabled per node
    mapping(bytes32 => bool) private _paymentEnabled;

    /// @notice Supported chain IDs per node
    mapping(bytes32 => uint256[]) private _supportedChains;

    /// @notice Track if a chain is already in the supportedChains array
    mapping(bytes32 => mapping(uint256 => bool)) private _chainExists;

    // ============ External Functions ============

    /**
     * @notice Get the x402 payment endpoint for a node
     * @param node The node to query
     * @return The x402 endpoint URL
     */
    function x402Endpoint(
        bytes32 node
    ) external view override returns (string memory) {
        return _x402Endpoints[node];
    }

    /**
     * @notice Set the x402 payment endpoint for a node
     * @param node The node to update
     * @param endpoint The x402 endpoint URL
     */
    function setX402Endpoint(
        bytes32 node,
        string calldata endpoint
    ) external override authorised(node) {
        _x402Endpoints[node] = endpoint;
        emit X402EndpointChanged(node, endpoint);
    }

    /**
     * @notice Get the payment address for a node on a specific chain
     * @param node The node to query
     * @param chainId The chain ID
     * @return The payment address
     */
    function paymentAddress(
        bytes32 node,
        uint256 chainId
    ) external view override returns (address) {
        return _paymentAddresses[node][chainId];
    }

    /**
     * @notice Set the payment address for a node on a specific chain
     * @param node The node to update
     * @param chainId The chain ID
     * @param addr The payment address
     */
    function setPaymentAddress(
        bytes32 node,
        uint256 chainId,
        address addr
    ) external override authorised(node) {
        _paymentAddresses[node][chainId] = addr;

        // Track supported chain if not already tracked
        if (!_chainExists[node][chainId]) {
            _supportedChains[node].push(chainId);
            _chainExists[node][chainId] = true;
        }

        emit PaymentAddressChanged(node, chainId, addr);
    }

    /**
     * @notice Get the agent metadata URI for a node
     * @param node The node to query
     * @return The metadata URI
     */
    function agentMetadata(
        bytes32 node
    ) external view override returns (string memory) {
        return _agentMetadata[node];
    }

    /**
     * @notice Set the agent metadata URI for a node
     * @param node The node to update
     * @param uri The metadata URI (IPFS, HTTP, etc.)
     */
    function setAgentMetadata(
        bytes32 node,
        string calldata uri
    ) external override authorised(node) {
        _agentMetadata[node] = uri;
        emit AgentMetadataChanged(node, uri);
    }

    /**
     * @notice Check if payments are enabled for a node
     * @param node The node to query
     * @return True if payments are enabled
     */
    function paymentEnabled(
        bytes32 node
    ) external view override returns (bool) {
        return _paymentEnabled[node];
    }

    /**
     * @notice Enable or disable payments for a node
     * @param node The node to update
     * @param enabled Whether to enable payments
     */
    function setPaymentEnabled(
        bytes32 node,
        bool enabled
    ) external override authorised(node) {
        _paymentEnabled[node] = enabled;
        emit PaymentEnabledChanged(node, enabled);
    }

    /**
     * @notice Get all supported chain IDs for a node
     * @param node The node to query
     * @return Array of supported chain IDs
     */
    function supportedChains(
        bytes32 node
    ) external view override returns (uint256[] memory) {
        return _supportedChains[node];
    }

    // ============ IERC165 ============

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override returns (bool) {
        return
            interfaceID == type(IPaymentResolver).interfaceId ||
            super.supportsInterface(interfaceID);
    }
}
