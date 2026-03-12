// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title IAgentPriceOracle
 * @notice Interface for the agent-aware price oracle
 */
interface IAgentPriceOracle {
    struct AgentPrice {
        uint256 priceWei; // Price in wei (ETH)
        uint256 priceUsd; // Price in USD with 18 decimals
        bool isAgentName; // Whether this qualifies for agent pricing
    }

    /**
     * @notice Get the price for registering a name
     * @param name The name to check (without .id suffix)
     * @return AgentPrice struct with pricing details
     */
    function getPrice(
        string calldata name
    ) external view returns (AgentPrice memory);

    /**
     * @notice Check if a name qualifies as an agent name
     * @param name The name to check (without .id suffix)
     * @return True if the name qualifies for agent pricing
     */
    function isAgentName(string calldata name) external view returns (bool);

    /**
     * @notice Get the count of pattern categories a name matches
     * @param name The name to check
     * @return Number of matching pattern categories (0-5)
     */
    function getPatternMatchCount(
        string calldata name
    ) external view returns (uint256);
}
