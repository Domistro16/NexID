// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract EmergencyGuard is AccessControl {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    bool public creationPaused;
    bool public tradingPaused;
    uint256 public protocolTvlCap;
    uint256 public dailyLaunchCap;
    uint256 public dailyVolumeCap;

    event EmergencyStateUpdated(bool creationPaused, bool tradingPaused);
    event CanaryCapsUpdated(uint256 protocolTvlCap, uint256 dailyLaunchCap, uint256 dailyVolumeCap);

    constructor(address admin) {
        require(admin != address(0), "admin required");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
    }

    function setEmergencyState(bool creationPaused_, bool tradingPaused_) external onlyRole(GUARDIAN_ROLE) {
        creationPaused = creationPaused_;
        tradingPaused = tradingPaused_;
        emit EmergencyStateUpdated(creationPaused_, tradingPaused_);
    }

    function setCanaryCaps(uint256 protocolTvlCap_, uint256 dailyLaunchCap_, uint256 dailyVolumeCap_) external onlyRole(GUARDIAN_ROLE) {
        protocolTvlCap = protocolTvlCap_;
        dailyLaunchCap = dailyLaunchCap_;
        dailyVolumeCap = dailyVolumeCap_;
        emit CanaryCapsUpdated(protocolTvlCap_, dailyLaunchCap_, dailyVolumeCap_);
    }
}
