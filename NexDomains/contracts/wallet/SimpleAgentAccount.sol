// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IAccount, PackedUserOperation} from "./interfaces/IAccount.sol";

/**
 * @title SimpleAgentAccount
 * @notice Minimal ERC-4337 compatible smart wallet for AI agents
 * @dev Deployed behind ERC1967Proxy via AgentAccountFactory.
 *      Updated for EntryPoint v0.7 (PackedUserOperation).
 */
contract SimpleAgentAccount is IAccount {
    using ECDSA for bytes32;

    address public owner;
    address public entryPoint;
    bool private _initialized;

    event SimpleAgentAccountInitialized(
        address indexed owner,
        address indexed entryPoint
    );
    event Executed(address indexed target, uint256 value, bytes data);

    modifier onlyOwnerOrEntryPoint() {
        require(
            msg.sender == owner || msg.sender == entryPoint,
            "Only owner or EntryPoint"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    function initialize(address _owner, address _entryPoint) external {
        require(!_initialized, "Already initialized");
        _initialized = true;
        owner = _owner;
        entryPoint = _entryPoint;
        emit SimpleAgentAccountInitialized(_owner, _entryPoint);
    }

    /**
     * @notice Execute a call from this account
     */
    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external onlyOwnerOrEntryPoint {
        _call(dest, value, func);
    }

    /**
     * @notice Execute a batch of calls
     */
    function executeBatch(
        address[] calldata dest,
        uint256[] calldata values,
        bytes[] calldata funcs
    ) external onlyOwnerOrEntryPoint {
        require(
            dest.length == funcs.length && dest.length == values.length,
            "Length mismatch"
        );
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], values[i], funcs[i]);
        }
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        emit Executed(target, value, data);
    }

    /**
     * @notice ERC-4337 v0.7 validateUserOp
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        require(msg.sender == entryPoint, "Only EntryPoint");

        bytes32 hash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash)
        );
        address recovered = hash.recover(userOp.signature);

        if (recovered != owner) {
            return 1; // SIG_VALIDATION_FAILED
        }

        if (missingAccountFunds > 0) {
            (bool success, ) = payable(entryPoint).call{
                value: missingAccountFunds
            }("");
            require(success, "Failed to prefund");
        }

        return 0; // SIG_VALIDATION_SUCCESS
    }

    /**
     * @notice Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    receive() external payable {}
}
