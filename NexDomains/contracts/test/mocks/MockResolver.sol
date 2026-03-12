// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

/**
 * @notice Mock PublicResolver for testing IDDomainAuction
 */
contract MockResolver {
    mapping(bytes32 => address) public addrs;

    function setAddr(bytes32 node, address addr) external {
        addrs[node] = addr;
    }

    function addr(bytes32 node) external view returns (address) {
        return addrs[node];
    }
}
