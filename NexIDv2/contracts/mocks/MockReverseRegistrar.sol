// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockReverseRegistrar is Ownable {
    mapping(address => bool) public controllers;
    mapping(address => string) public names;

    event ControllerUpdated(address indexed controller, bool allowed);
    event ReverseNameSet(address indexed addr, string name);

    constructor(address admin) Ownable(admin) {}

    function setController(address controller, bool allowed) external onlyOwner {
        controllers[controller] = allowed;
        emit ControllerUpdated(controller, allowed);
    }

    function setNameForAddr(
        address addr,
        address,
        address,
        string calldata name
    ) external returns (bytes32) {
        require(controllers[msg.sender] || msg.sender == addr, "not authorized");
        names[addr] = name;
        emit ReverseNameSet(addr, name);
        return keccak256(abi.encodePacked(addr));
    }
}
