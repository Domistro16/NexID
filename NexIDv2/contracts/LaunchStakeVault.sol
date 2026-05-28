// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract LaunchStakeVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 public constant RESOLUTION_ROLE = keccak256("RESOLUTION_ROLE");

    uint256 public constant LAUNCH_STAKE_USDC = 20_000_000;
    uint256 public constant NON_REFUNDABLE_FEE_USDC = 10_000_000;
    uint256 public constant QUALITY_BOND_USDC = 10_000_000;

    IERC20 public immutable collateral;
    address public protocolTreasury;
    address public rewardsPool;
    address public securityPool;

    struct StakeRecord {
        address creator;
        address market;
        bytes32 rulesHash;
        uint256 bondAmount;
        bool returned;
        bool slashed;
    }

    mapping(bytes32 => StakeRecord) public stakes;

    event LaunchStakePaid(bytes32 indexed stakeId, address indexed creator, bytes32 indexed rulesHash, uint256 feeAmount, uint256 bondAmount);
    event LaunchStakeBound(bytes32 indexed stakeId, address indexed market);
    event QualityBondReturned(bytes32 indexed stakeId, address indexed creator, uint256 amount);
    event QualityBondSlashed(bytes32 indexed stakeId, address indexed creator, uint256 amount, string reason);
    event LaunchFeeDistributed(address indexed creator, uint256 protocolAmount, uint256 rewardsAmount, uint256 securityAmount);

    constructor(IERC20 collateral_, address admin, address protocolTreasury_, address rewardsPool_, address securityPool_) {
        require(address(collateral_) != address(0), "collateral required");
        collateral = collateral_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FACTORY_ROLE, admin);
        _grantRole(RESOLUTION_ROLE, admin);
        _setRecipients(protocolTreasury_, rewardsPool_, securityPool_);
    }

    function setRecipients(address protocolTreasury_, address rewardsPool_, address securityPool_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRecipients(protocolTreasury_, rewardsPool_, securityPool_);
    }

    function stakeIdFor(address creator, bytes32 rulesHash) public view returns (bytes32) {
        return keccak256(abi.encodePacked(creator, rulesHash, block.chainid, block.number, address(this)));
    }

    function recordPaidLaunchStake(address creator, bytes32 rulesHash, address market, bytes32 stakeId) external onlyRole(FACTORY_ROLE) nonReentrant {
        require(creator != address(0), "creator required");
        require(rulesHash != bytes32(0), "rules hash required");
        require(market != address(0), "market required");
        require(stakeId != bytes32(0), "stake id required");
        require(stakes[stakeId].creator == address(0), "stake exists");

        uint256 protocolAmount = 5_000_000;
        uint256 rewardsAmount = 3_000_000;
        uint256 securityAmount = NON_REFUNDABLE_FEE_USDC - protocolAmount - rewardsAmount;
        stakes[stakeId] = StakeRecord({
            creator: creator,
            market: market,
            rulesHash: rulesHash,
            bondAmount: QUALITY_BOND_USDC,
            returned: false,
            slashed: false
        });

        emit LaunchStakePaid(stakeId, creator, rulesHash, NON_REFUNDABLE_FEE_USDC, QUALITY_BOND_USDC);
        emit LaunchStakeBound(stakeId, market);
        emit LaunchFeeDistributed(creator, protocolAmount, rewardsAmount, securityAmount);

        collateral.safeTransfer(protocolTreasury, protocolAmount);
        collateral.safeTransfer(rewardsPool, rewardsAmount);
        collateral.safeTransfer(securityPool, securityAmount);
    }

    function bindMarket(bytes32 stakeId, address market) external onlyRole(FACTORY_ROLE) {
        require(market != address(0), "market required");
        StakeRecord storage record = stakes[stakeId];
        require(record.creator != address(0), "unknown stake");
        require(record.market == address(0), "already bound");
        record.market = market;
        emit LaunchStakeBound(stakeId, market);
    }

    function returnBond(bytes32 stakeId) external onlyRole(RESOLUTION_ROLE) nonReentrant {
        StakeRecord storage record = stakes[stakeId];
        require(record.creator != address(0), "unknown stake");
        require(!record.returned && !record.slashed, "bond settled");
        record.returned = true;
        collateral.safeTransfer(record.creator, record.bondAmount);
        emit QualityBondReturned(stakeId, record.creator, record.bondAmount);
    }

    function slashBond(bytes32 stakeId, string calldata reason) external onlyRole(RESOLUTION_ROLE) nonReentrant {
        StakeRecord storage record = stakes[stakeId];
        require(record.creator != address(0), "unknown stake");
        require(!record.returned && !record.slashed, "bond settled");
        record.slashed = true;
        collateral.safeTransfer(securityPool, record.bondAmount);
        emit QualityBondSlashed(stakeId, record.creator, record.bondAmount, reason);
    }

    function _setRecipients(address protocolTreasury_, address rewardsPool_, address securityPool_) private {
        require(protocolTreasury_ != address(0), "protocol treasury required");
        require(rewardsPool_ != address(0), "rewards pool required");
        require(securityPool_ != address(0), "security pool required");
        protocolTreasury = protocolTreasury_;
        rewardsPool = rewardsPool_;
        securityPool = securityPool_;
    }
}
