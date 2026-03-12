// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

/**
 * @notice Mock NameWrapper for testing IDDomainAuction
 */
contract MockNameWrapper {
    mapping(bytes32 => address) public owners;

    event NameRegistered(
        bytes32 indexed node,
        address indexed owner,
        address resolver,
        uint256 expires
    );

    function registerAndWrapETH2LD(
        string calldata /* label */,
        address owner,
        uint256 /* duration */,
        address resolver,
        uint16 /* ownerControlledFuses */
    ) external returns (uint256 expires) {
        bytes32 node = keccak256(
            abi.encodePacked(bytes32(0), keccak256(bytes("test")))
        );
        owners[node] = owner;
        expires = block.timestamp + 100 * 365 days;
        emit NameRegistered(node, owner, resolver, expires);
    }

    function ownerOf(uint256 /* tokenId */) external view returns (address) {
        return address(this);
    }
}
