// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBuybackBurner {
    function onFeeReceived(address token, uint256 amount) external;
}

interface IMarketFactory {
    function isGenesisMarket(address market) external view returns (bool);
}

contract FeeRouter is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant PROVER_POOL_RELEASER_ROLE = keccak256("PROVER_POOL_RELEASER_ROLE");

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant NATIVE_TRADING_FEE_BPS = 200; // 2%
    uint256 public constant GENESIS_PROVER_COUNT = 5;

    // Normal Market BPS Splits (Total: 200 BPS / 2%)
    uint256 public constant NORMAL_CREATOR_BPS = 100;  // 1%
    uint256 public constant NORMAL_PROVER_BPS = 20;    // 0.2%
    uint256 public constant NORMAL_PLATFORM_BPS = 15;  // 0.15%
    uint256 public constant NORMAL_BUYBACK_BPS = 65;   // 0.65%

    // Genesis Market BPS Splits (Total: 200 BPS / 2%)
    uint256 public constant GENESIS_PROVER_BPS = 20;    // 0.2%
    uint256 public constant GENESIS_PLATFORM_BPS = 15;  // 0.15%
    uint256 public constant GENESIS_BUYBACK_BPS = 165;  // 1.65%

    address public platformTreasury;
    address public buybackBurnAddress;
    address[] public provers;
    address public marketFactory;
    mapping(address => bool) public isGenesisProver;
    mapping(address => address) public proverPoolToken;
    mapping(address => uint256) public genesisProverPoolAccrued;
    mapping(address => uint256) public genesisProverPoolReleased;
    mapping(address => uint256) public genesisProverPoolBalance;
    mapping(address => mapping(address => uint256)) public claimableProverFees;
    mapping(address => address[]) private marketProvers;

    event FeeRecipientsUpdated(address indexed platformTreasury, address indexed buybackBurnAddress, address[] provers);
    event MarketFactoryUpdated(address indexed marketFactory);
    event GenesisProverPoolFunded(address indexed market, address indexed token, uint256 amount);
    event GenesisProverPoolReleased(address indexed market, address indexed token, uint256 amount);
    event GenesisProverFeePaid(address indexed market, address indexed prover, address indexed token, uint256 amount);
    event GenesisProverFeeClaimed(address indexed prover, address indexed token, uint256 amount);
    event MarketProversAssigned(address indexed market, address[] provers);
    event NativeTradeFeeRouted(
        address indexed market,
        address indexed creator,
        uint256 notional,
        uint256 creatorAmount,
        uint256 platformAmount,
        uint256 proverAmount,
        uint256 buybackAmount
    );

    constructor(
        address admin,
        address platformTreasury_,
        address buybackBurnAddress_,
        address[] memory provers_
    ) {
        require(NORMAL_CREATOR_BPS + NORMAL_PROVER_BPS + NORMAL_PLATFORM_BPS + NORMAL_BUYBACK_BPS == NATIVE_TRADING_FEE_BPS, "normal fee split mismatch");
        require(GENESIS_PROVER_BPS + GENESIS_PLATFORM_BPS + GENESIS_BUYBACK_BPS == NATIVE_TRADING_FEE_BPS, "genesis fee split mismatch");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROVER_POOL_RELEASER_ROLE, admin);
        _setRecipients(platformTreasury_, buybackBurnAddress_, provers_);
    }

    function setRecipients(
        address platformTreasury_,
        address buybackBurnAddress_,
        address[] calldata provers_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRecipients(platformTreasury_, buybackBurnAddress_, provers_);
    }

    function setMarketFactory(address marketFactory_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        marketFactory = marketFactory_;
        emit MarketFactoryUpdated(marketFactory_);
    }

    function setMarketProvers(address market, address[] calldata marketProvers_) external onlyRole(PROVER_POOL_RELEASER_ROLE) {
        require(market != address(0), "market required");
        require(marketProvers_.length == GENESIS_PROVER_COUNT, "five provers required");

        delete marketProvers[market];
        for (uint256 i = 0; i < marketProvers_.length; i++) {
            address prover = marketProvers_[i];
            require(prover != address(0), "prover required");
            require(isGenesisProver[prover], "not genesis prover");
            for (uint256 j = 0; j < i; j++) {
                require(marketProvers_[j] != prover, "duplicate prover");
            }
            marketProvers[market].push(prover);
        }

        emit MarketProversAssigned(market, marketProvers_);
    }

    function expectedFee(uint256 notional) public pure returns (uint256) {
        return (notional * NATIVE_TRADING_FEE_BPS) / BPS_DENOMINATOR;
    }

    function routeTradeFee(IERC20 token, address creator, uint256 notional) external returns (uint256 totalFee) {
        totalFee = expectedFee(notional);

        bool isGenesis = false;
        if (marketFactory != address(0)) {
            try IMarketFactory(marketFactory).isGenesisMarket(msg.sender) returns (bool result) {
                isGenesis = result;
            } catch {}
        }

        uint256 creatorAmount;
        uint256 proverAmount;
        uint256 platformAmount;
        uint256 buybackAmount;

        if (isGenesis) {
            creatorAmount = 0;
            proverAmount = (notional * GENESIS_PROVER_BPS) / BPS_DENOMINATOR;
            platformAmount = (notional * GENESIS_PLATFORM_BPS) / BPS_DENOMINATOR;
            buybackAmount = totalFee - proverAmount - platformAmount; // Avoid dust
        } else {
            require(creator != address(0), "creator required");
            creatorAmount = (notional * NORMAL_CREATOR_BPS) / BPS_DENOMINATOR;
            proverAmount = (notional * NORMAL_PROVER_BPS) / BPS_DENOMINATOR;
            platformAmount = (notional * NORMAL_PLATFORM_BPS) / BPS_DENOMINATOR;
            buybackAmount = totalFee - creatorAmount - proverAmount - platformAmount; // Avoid dust
        }

        if (creatorAmount > 0) {
            token.safeTransferFrom(msg.sender, creator, creatorAmount);
        }
        if (platformAmount > 0) {
            token.safeTransferFrom(msg.sender, platformTreasury, platformAmount);
        }
        if (buybackAmount > 0) {
            token.safeTransferFrom(msg.sender, buybackBurnAddress, buybackAmount);
            if (buybackBurnAddress.code.length > 0) {
                try IBuybackBurner(buybackBurnAddress).onFeeReceived(address(token), buybackAmount) {} catch {}
            }
        }

        if (proverAmount > 0) {
            token.safeTransferFrom(msg.sender, address(this), proverAmount);
            _creditGenesisProverPool(address(token), msg.sender, proverAmount);
        }

        emit NativeTradeFeeRouted(msg.sender, creator, notional, creatorAmount, platformAmount, proverAmount, buybackAmount);
    }

    function claimProverFees(IERC20 token, address[] calldata markets) external returns (uint256 claimedAmount) {
        address tokenAddress = address(token);
        bool authorized = isGenesisProver[msg.sender];

        for (uint256 i = 0; i < markets.length; i++) {
            address market = markets[i];
            require(proverPoolToken[market] == tokenAddress, "wrong token");
            authorized = authorized || _isMarketProver(market, msg.sender);
            uint256 claimable = claimableProverFees[market][msg.sender];
            if (claimable == 0) continue;

            authorized = true;
            claimableProverFees[market][msg.sender] = 0;
            genesisProverPoolBalance[market] -= claimable;
            claimedAmount += claimable;
        }

        require(authorized, "not genesis prover");
        require(claimedAmount > 0, "nothing to claim");
        token.safeTransfer(msg.sender, claimedAmount);
        emit GenesisProverFeeClaimed(msg.sender, tokenAddress, claimedAmount);
    }

    function releaseGenesisProverPool(address market) external onlyRole(PROVER_POOL_RELEASER_ROLE) returns (uint256 releasedAmount) {
        releasedAmount = _releaseGenesisProverPool(market);
    }

    function releaseGenesisProverPools(address[] calldata markets) external onlyRole(PROVER_POOL_RELEASER_ROLE) returns (uint256 releasedAmount) {
        for (uint256 i = 0; i < markets.length; i++) {
            releasedAmount += _releaseGenesisProverPool(markets[i]);
        }
    }

    function _setRecipients(
        address platformTreasury_,
        address buybackBurnAddress_,
        address[] memory provers_
    ) private {
        require(platformTreasury_ != address(0), "platform treasury required");
        require(buybackBurnAddress_ != address(0), "buyback burn address required");
        require(provers_.length == GENESIS_PROVER_COUNT, "five provers required");

        for (uint256 i = 0; i < provers.length; i++) {
            isGenesisProver[provers[i]] = false;
        }

        platformTreasury = platformTreasury_;
        buybackBurnAddress = buybackBurnAddress_;
        delete provers;
        for (uint256 i = 0; i < provers_.length; i++) {
            address prover = provers_[i];
            require(prover != address(0), "prover required");
            require(!isGenesisProver[prover], "duplicate prover");
            isGenesisProver[prover] = true;
            provers.push(prover);
        }

        emit FeeRecipientsUpdated(platformTreasury_, buybackBurnAddress_, provers_);
    }

    function _creditGenesisProverPool(address token, address market, uint256 amount) private {
        address existingToken = proverPoolToken[market];
        if (existingToken == address(0)) {
            proverPoolToken[market] = token;
        } else {
            require(existingToken == token, "prover pool token mismatch");
        }

        genesisProverPoolAccrued[market] += amount;
        genesisProverPoolBalance[market] += amount;
        emit GenesisProverPoolFunded(market, token, amount);
    }

    function _releaseGenesisProverPool(address market) private returns (uint256 amount) {
        require(market != address(0), "market required");
        address token = proverPoolToken[market];
        require(token != address(0), "unknown prover pool");

        amount = genesisProverPoolAccrued[market] - genesisProverPoolReleased[market];
        require(amount > 0, "nothing to release");
        genesisProverPoolReleased[market] += amount;
        genesisProverPoolBalance[market] -= amount;

        address[] storage releaseProvers = provers;
        if (marketProvers[market].length != 0) {
            releaseProvers = marketProvers[market];
        }
        uint256 amountPerProver = amount / releaseProvers.length;
        uint256 paidAmount;
        IERC20 tokenContract = IERC20(token);
        for (uint256 i = 0; i < releaseProvers.length - 1; i++) {
            tokenContract.safeTransfer(releaseProvers[i], amountPerProver);
            paidAmount += amountPerProver;
            emit GenesisProverFeePaid(market, releaseProvers[i], token, amountPerProver);
        }
        uint256 finalAmount = amount - paidAmount;
        tokenContract.safeTransfer(releaseProvers[releaseProvers.length - 1], finalAmount);
        emit GenesisProverFeePaid(market, releaseProvers[releaseProvers.length - 1], token, finalAmount);
        emit GenesisProverPoolReleased(market, token, amount);
    }

    function getProvers() external view returns (address[] memory) {
        return provers;
    }

    function getMarketProvers(address market) external view returns (address[] memory) {
        if (marketProvers[market].length == 0) {
            return provers;
        }
        return marketProvers[market];
    }

    function _isMarketProver(address market, address prover) private view returns (bool) {
        address[] storage selected = marketProvers[market];
        for (uint256 i = 0; i < selected.length; i++) {
            if (selected[i] == prover) return true;
        }
        return false;
    }
}
