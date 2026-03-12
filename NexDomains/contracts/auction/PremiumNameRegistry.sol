// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PremiumNameRegistry
 * @notice Registry of premium names reserved for auction
 * @dev The registrar controller should check this before allowing direct registration
 */
contract PremiumNameRegistry is Ownable {
    // ============ State ============

    /// @notice nameHash => isPremium
    mapping(bytes32 => bool) public premiumNames;

    /// @notice nameHash => customPrice (0 = use auction)
    mapping(bytes32 => uint256) public fixedPremiumPrices;

    // ============ Events ============

    event PremiumNameAdded(
        string indexed name,
        bool useAuction,
        uint256 fixedPrice
    );
    event PremiumNameRemoved(string indexed name);

    // ============ Constructor ============

    constructor() {}

    // ============ Admin Functions ============

    /**
     * @notice Add a premium name (auction only)
     * @param name The name to reserve for auction
     */
    function addPremiumName(string calldata name) external onlyOwner {
        bytes32 nameHash = keccak256(bytes(name));
        premiumNames[nameHash] = true;
        emit PremiumNameAdded(name, true, 0);
    }

    /**
     * @notice Add a premium name with fixed price instead of auction
     * @param name The name to add
     * @param price Fixed price in USD (18 decimals)
     */
    function addPremiumNameWithPrice(
        string calldata name,
        uint256 price
    ) external onlyOwner {
        bytes32 nameHash = keccak256(bytes(name));
        premiumNames[nameHash] = true;
        fixedPremiumPrices[nameHash] = price;
        emit PremiumNameAdded(name, false, price);
    }

    /**
     * @notice Batch add premium names for auction
     * @param names Array of names to add
     */
    function addPremiumNamesBatch(string[] calldata names) external onlyOwner {
        for (uint256 i = 0; i < names.length; i++) {
            bytes32 nameHash = keccak256(bytes(names[i]));
            premiumNames[nameHash] = true;
            emit PremiumNameAdded(names[i], true, 0);
        }
    }

    /**
     * @notice Remove a premium name from registry
     * @param name The name to remove
     */
    function removePremiumName(string calldata name) external onlyOwner {
        bytes32 nameHash = keccak256(bytes(name));
        premiumNames[nameHash] = false;
        fixedPremiumPrices[nameHash] = 0;
        emit PremiumNameRemoved(name);
    }

    // ============ View Functions ============

    /**
     * @notice Check if a name is premium
     * @param name The name to check
     * @return isPremium Whether the name is premium
     */
    function isPremium(string calldata name) external view returns (bool) {
        return premiumNames[keccak256(bytes(name))];
    }

    /**
     * @notice Get premium status and pricing info
     * @param name The name to check
     * @return isPremiumName Whether the name is in premium registry
     * @return requiresAuction Whether name must be purchased via auction
     * @return fixedPrice Fixed price (0 if auction required)
     */
    function getPremiumInfo(
        string calldata name
    )
        external
        view
        returns (bool isPremiumName, bool requiresAuction, uint256 fixedPrice)
    {
        bytes32 nameHash = keccak256(bytes(name));
        isPremiumName = premiumNames[nameHash];
        fixedPrice = fixedPremiumPrices[nameHash];
        requiresAuction = isPremiumName && fixedPrice == 0;
    }
}
