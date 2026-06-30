// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {FeeRouter} from "./FeeRouter.sol";
import {LaunchStakeVault} from "./LaunchStakeVault.sol";
import {NativeBinaryMarket} from "./NativeBinaryMarket.sol";

contract MarketFactory is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant TEMPLATE_ADMIN_ROLE = keccak256("TEMPLATE_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant GENESIS_LAUNCHER_ROLE = keccak256("GENESIS_LAUNCHER_ROLE");
    bytes32 public constant LAUNCH_AUTHORIZATION_TYPEHASH = keccak256(
        "LaunchAuthorization(address creator,bytes32 rulesHash,bytes32 metadataHash,bytes32 templateId,uint256 closeTime,uint256 nonce,uint256 deadline)"
    );

    IERC20 public immutable collateral;
    FeeRouter public feeRouter;
    LaunchStakeVault public immutable launchStakeVault;
    address public immutable resolutionManager;
    address public launchAuthorizer;

    uint256 public launchCooldown = 3 minutes;

    uint256 public immutable MAX_GENESIS_MARKETS;
    uint256 public immutable GENESIS_DURATION;
    uint256 public immutable genesisStartTimestamp;
    uint256 public genesisMarketCount;
    mapping(address => bool) public isGenesisMarket;

    mapping(bytes32 => bool) public activeRulesHashes;
    mapping(bytes32 => bool) public allowedTemplates;
    mapping(bytes32 => bool) public usedLaunchAuthorizations;
    address[] public markets;

    struct LaunchAuthorization {
        uint256 nonce;
        uint256 deadline;
        bytes signature;
    }

    event MarketCreated(
        address indexed market,
        address indexed creator,
        bytes32 indexed rulesHash,
        bytes32 metadataHash,
        bytes32 templateId,
        bytes32 stakeId,
        uint256 openAt,
        uint256 closeTime
    );
    event GenesisMarketCreated(address indexed market, bytes32 indexed rulesHash);
    event TemplateAllowed(bytes32 indexed templateId, bool allowed);
    event FactoryLimitsUpdated(uint256 launchCooldown);
    event LaunchAuthorizerUpdated(address indexed authorizer);
    event FeeRouterUpdated(address indexed feeRouter);

    constructor(
        IERC20 collateral_,
        FeeRouter feeRouter_,
        LaunchStakeVault launchStakeVault_,
        address resolutionManager_,
        address launchAuthorizer_,
        address genesisLauncher_,
        uint256 maxGenesisMarkets_,
        uint256 genesisDuration_,
        address admin
    ) EIP712("NexMarketsMarketFactory", "1") {
        require(address(collateral_) != address(0), "collateral required");
        require(address(feeRouter_) != address(0), "fee router required");
        require(address(launchStakeVault_) != address(0), "stake vault required");
        require(resolutionManager_ != address(0), "resolution manager required");
        require(launchAuthorizer_ != address(0), "authorizer required");
        require(genesisLauncher_ != address(0), "genesis launcher required");
        require(maxGenesisMarkets_ > 0, "genesis cap required");
        require(genesisDuration_ > 0, "genesis duration required");
        require(admin != address(0), "admin required");

        collateral = collateral_;
        feeRouter = feeRouter_;
        launchStakeVault = launchStakeVault_;
        resolutionManager = resolutionManager_;
        launchAuthorizer = launchAuthorizer_;
        MAX_GENESIS_MARKETS = maxGenesisMarkets_;
        GENESIS_DURATION = genesisDuration_;
        genesisStartTimestamp = block.timestamp;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TEMPLATE_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(GENESIS_LAUNCHER_ROLE, genesisLauncher_);
    }

    function createMarket(
        bytes32 rulesHash,
        bytes32 metadataHash,
        bytes32 templateId,
        uint256 closeTime,
        LaunchAuthorization calldata authorization
    ) external nonReentrant whenNotPaused returns (address market) {
        require(rulesHash != bytes32(0), "rules hash required");
        require(metadataHash != bytes32(0), "metadata hash required");
        require(allowedTemplates[templateId], "template not allowed");
        require(!activeRulesHashes[rulesHash], "duplicate rules hash");
        _consumeLaunchAuthorization(msg.sender, rulesHash, metadataHash, templateId, closeTime, authorization);

        uint256 openAt = block.timestamp + launchCooldown;
        require(closeTime > openAt, "bad close time");

        activeRulesHashes[rulesHash] = true;

        bytes32 stakeId = launchStakeVault.stakeIdFor(msg.sender, rulesHash);
        market = address(new NativeBinaryMarket(
            collateral,
            resolutionManager,
            msg.sender,
            rulesHash,
            metadataHash,
            stakeId,
            openAt,
            closeTime
        ));
        markets.push(market);

        emit MarketCreated(market, msg.sender, rulesHash, metadataHash, templateId, stakeId, openAt, closeTime);

        collateral.safeTransferFrom(msg.sender, address(launchStakeVault), launchStakeVault.LAUNCH_STAKE_USDC());
        launchStakeVault.recordPaidLaunchStake(msg.sender, rulesHash, market, stakeId);
    }

    function createGenesisMarket(
        bytes32 rulesHash,
        bytes32 metadataHash,
        bytes32 templateId,
        uint256 closeTime,
        LaunchAuthorization calldata authorization
    ) external nonReentrant whenNotPaused onlyRole(GENESIS_LAUNCHER_ROLE) returns (address market) {
        require(block.timestamp <= genesisStartTimestamp + GENESIS_DURATION, "genesis period ended");
        require(genesisMarketCount < MAX_GENESIS_MARKETS, "genesis cap reached");
        require(rulesHash != bytes32(0), "rules hash required");
        require(metadataHash != bytes32(0), "metadata hash required");
        require(allowedTemplates[templateId], "template not allowed");
        require(!activeRulesHashes[rulesHash], "duplicate rules hash");
        _consumeLaunchAuthorization(msg.sender, rulesHash, metadataHash, templateId, closeTime, authorization);

        uint256 openAt = block.timestamp + launchCooldown;
        require(closeTime > openAt, "bad close time");

        activeRulesHashes[rulesHash] = true;
        genesisMarketCount++;

        market = address(new NativeBinaryMarket(
            collateral,
            resolutionManager,
            msg.sender,
            rulesHash,
            metadataHash,
            bytes32(0), // No stake for genesis markets
            openAt,
            closeTime
        ));
        isGenesisMarket[market] = true;
        markets.push(market);

        emit MarketCreated(market, msg.sender, rulesHash, metadataHash, templateId, bytes32(0), openAt, closeTime);
        emit GenesisMarketCreated(market, rulesHash);
    }

    function setFeeRouter(FeeRouter feeRouter_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(feeRouter_) != address(0), "fee router required");
        feeRouter = feeRouter_;
        emit FeeRouterUpdated(address(feeRouter_));
    }

    function setLaunchAuthorizer(address launchAuthorizer_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(launchAuthorizer_ != address(0), "authorizer required");
        launchAuthorizer = launchAuthorizer_;
        emit LaunchAuthorizerUpdated(launchAuthorizer_);
    }

    function setTemplateAllowed(bytes32 templateId, bool allowed) external onlyRole(TEMPLATE_ADMIN_ROLE) {
        require(templateId != bytes32(0), "template required");
        allowedTemplates[templateId] = allowed;
        emit TemplateAllowed(templateId, allowed);
    }

    function setFactoryLimits(uint256 launchCooldown_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(launchCooldown_ >= 60, "cooldown too short");
        launchCooldown = launchCooldown_;
        emit FactoryLimitsUpdated(launchCooldown_);
    }

    function releaseRulesHash(bytes32 rulesHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        activeRulesHashes[rulesHash] = false;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    // Overridden from Pausable
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function marketsCount() external view returns (uint256) {
        return markets.length;
    }

    function _consumeLaunchAuthorization(
        address creator,
        bytes32 rulesHash,
        bytes32 metadataHash,
        bytes32 templateId,
        uint256 closeTime,
        LaunchAuthorization calldata authorization
    ) private {
        require(block.timestamp <= authorization.deadline, "authorization expired");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            LAUNCH_AUTHORIZATION_TYPEHASH,
            creator,
            rulesHash,
            metadataHash,
            templateId,
            closeTime,
            authorization.nonce,
            authorization.deadline
        )));

        require(!usedLaunchAuthorizations[digest], "authorization used");
        require(ECDSA.recover(digest, authorization.signature) == launchAuthorizer, "bad launch authorization");
        usedLaunchAuthorizations[digest] = true;
    }
}
