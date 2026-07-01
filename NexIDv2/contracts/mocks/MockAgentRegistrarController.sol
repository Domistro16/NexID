// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockAgentRegistrarController is Ownable {
    struct RegisterRequest {
        string name;
        address owner;
        bytes32 secret;
        address resolver;
        bytes[] data;
        bool reverseRecord;
        uint16 ownerControlledFuses;
        bool deployWallet;
        uint256 walletSalt;
    }

    mapping(bytes32 => address) public reservedOwners;
    mapping(bytes32 => address) public mintedOwners;

    event NameReserved(bytes32 indexed label, string name, address indexed owner);
    event NameReservationCleared(bytes32 indexed label, string name);
    event ReservedNameMinted(bytes32 indexed label, string name, address indexed owner);

    constructor(address admin) Ownable(admin) {}

    function available(string calldata name) external view returns (bool) {
        return mintedOwners[keccak256(bytes(name))] == address(0);
    }

    function reserveNamesBatch(string[] calldata names, address[] calldata owners) external onlyOwner {
        require(names.length == owners.length, "Length mismatch");
        for (uint256 i = 0; i < names.length; i++) {
            bytes32 label = keccak256(bytes(names[i]));
            reservedOwners[label] = owners[i];
            emit NameReserved(label, names[i], owners[i]);
        }
    }

    function mintReserved(RegisterRequest calldata req) external onlyOwner {
        bytes32 label = keccak256(bytes(req.name));
        require(mintedOwners[label] == address(0), "Name not available");
        require(reservedOwners[label] != address(0), "Not reserved");
        require(reservedOwners[label] == req.owner, "Owner mismatch");
        mintedOwners[label] = req.owner;
        reservedOwners[label] = address(0);
        emit NameReservationCleared(label, req.name);
        emit ReservedNameMinted(label, req.name, req.owner);
    }
}
