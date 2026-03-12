// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title AgentAccountFactory
 * @notice Factory for deploying ERC-4337 smart wallets for AI agents
 * @dev Uses deterministic CREATE2 for predictable addresses
 */
contract AgentAccountFactory {
    address public immutable accountImplementation;
    address public immutable entryPoint;

    event AccountCreated(address indexed owner, address indexed account, uint256 salt);

    constructor(address _accountImplementation, address _entryPoint) {
        accountImplementation = _accountImplementation;
        entryPoint = _entryPoint;
    }

    /**
     * @notice Create a new AA wallet for an agent
     * @param owner The owner of the wallet (can be EOA or another contract)
     * @param salt Unique salt for deterministic address
     */
    function createAccount(address owner, uint256 salt) external returns (address) {
        address addr = getAddress(owner, salt);

        // Return existing if already deployed
        if (addr.code.length > 0) {
            return addr;
        }

        // Deploy new account
        bytes memory initData = abi.encodeWithSignature(
            "initialize(address,address)",
            owner,
            entryPoint
        );

        ERC1967Proxy proxy = new ERC1967Proxy{salt: bytes32(salt)}(
            accountImplementation,
            initData
        );

        emit AccountCreated(owner, address(proxy), salt);
        return address(proxy);
    }

    /**
     * @notice Get the deterministic address for an account
     */
    function getAddress(address owner, uint256 salt) public view returns (address) {
        bytes memory initData = abi.encodeWithSignature(
            "initialize(address,address)",
            owner,
            entryPoint
        );

        bytes memory bytecode = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(accountImplementation, initData)
        );

        return Create2.computeAddress(bytes32(salt), keccak256(bytecode));
    }
}
