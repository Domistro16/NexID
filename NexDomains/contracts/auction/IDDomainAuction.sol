// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface INameWrapper {
    function registerAndWrapETH2LD(
        string calldata label,
        address wrappedOwner,
        uint256 duration,
        address resolver,
        uint16 ownerControlledFuses
    ) external returns (uint256 expires);
}

/**
 * @title IDDomainAuction
 * @notice English auction system for premium .id domain names
 * @dev Supports ETH and USDC bidding with anti-sniping protection
 */
contract IDDomainAuction is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Structs ============

    struct Auction {
        string name; // Domain name (without .id)
        address seller; // Who listed (usually protocol)
        uint256 reservePrice; // Minimum price in wei/USDC
        uint256 startTime; // When auction starts
        uint256 endTime; // When auction ends
        uint256 highestBid; // Current highest bid
        address highestBidder; // Current highest bidder
        bool settled; // Whether auction has been settled
        bool isUSDC; // Whether auction is in USDC
    }

    // ============ Constants ============

    uint256 public constant MIN_AUCTION_DURATION = 1 days;
    uint256 public constant MAX_AUCTION_DURATION = 30 days;
    uint256 public constant TIME_EXTENSION = 10 minutes; // Anti-sniping
    uint256 public constant MIN_BID_INCREMENT_BPS = 500; // 5% minimum increment
    uint256 private constant LIFETIME_DURATION = 31536000000; // ~1000 years
    uint256 private constant BPS_DENOMINATOR = 10000;

    // ============ State ============

    INameWrapper public immutable nameWrapper;
    address public immutable resolver;
    IERC20 public immutable usdc;
    address public treasury;

    /// @notice auctionId => Auction
    mapping(uint256 => Auction) public auctions;
    uint256 public nextAuctionId;

    /// @notice nameHash => auctionId (for active auctions)
    mapping(bytes32 => uint256) public activeAuctions;

    /// @notice bidder => auctionId => amount (for refunds)
    mapping(address => mapping(uint256 => uint256)) public pendingReturns;

    // ============ Events ============

    event AuctionCreated(
        uint256 indexed auctionId,
        string name,
        uint256 reservePrice,
        uint256 startTime,
        uint256 endTime,
        bool isUSDC
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionExtended(uint256 indexed auctionId, uint256 newEndTime);

    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount
    );

    event AuctionCancelled(uint256 indexed auctionId);

    // ============ Errors ============

    error DurationTooShort();
    error DurationTooLong();
    error ReserveMustBePositive();
    error AuctionAlreadyExists();
    error AuctionNotStarted();
    error AuctionEnded();
    error AuctionNotEnded();
    error AuctionAlreadySettled();
    error BidTooLow(uint256 minBid);
    error NoBids();
    error HasBids();
    error NothingToWithdraw();
    error TransferFailed();
    error WrongPaymentType();

    // ============ Constructor ============

    constructor(
        address _nameWrapper,
        address _resolver,
        address _usdc,
        address _treasury
    ) {
        nameWrapper = INameWrapper(_nameWrapper);
        resolver = _resolver;
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    // ============ Admin: Create Auction ============

    /**
     * @notice Create a new auction for a premium name
     * @param name Domain name (without .id)
     * @param reservePrice Minimum bid
     * @param duration Auction duration in seconds
     * @param isUSDC Whether to accept USDC instead of ETH
     */
    function createAuction(
        string calldata name,
        uint256 reservePrice,
        uint256 duration,
        bool isUSDC
    ) external onlyOwner returns (uint256 auctionId) {
        if (duration < MIN_AUCTION_DURATION) revert DurationTooShort();
        if (duration > MAX_AUCTION_DURATION) revert DurationTooLong();
        if (reservePrice == 0) revert ReserveMustBePositive();

        bytes32 nameHash = keccak256(bytes(name));
        if (activeAuctions[nameHash] != 0) revert AuctionAlreadyExists();

        auctionId = ++nextAuctionId;

        auctions[auctionId] = Auction({
            name: name,
            seller: msg.sender,
            reservePrice: reservePrice,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            highestBid: 0,
            highestBidder: address(0),
            settled: false,
            isUSDC: isUSDC
        });

        activeAuctions[nameHash] = auctionId;

        emit AuctionCreated(
            auctionId,
            name,
            reservePrice,
            block.timestamp,
            block.timestamp + duration,
            isUSDC
        );
    }

    /**
     * @notice Batch create auctions for multiple names
     */
    function createAuctionBatch(
        string[] calldata names,
        uint256[] calldata reservePrices,
        uint256 duration,
        bool isUSDC
    ) external onlyOwner {
        require(names.length == reservePrices.length, "Length mismatch");

        for (uint256 i = 0; i < names.length; i++) {
            this.createAuction(names[i], reservePrices[i], duration, isUSDC);
        }
    }

    // ============ Bidding ============

    /**
     * @notice Place a bid on an ETH auction
     * @param auctionId The auction to bid on
     */
    function bid(uint256 auctionId) external payable nonReentrant {
        Auction storage auction = auctions[auctionId];

        if (auction.isUSDC) revert WrongPaymentType();
        if (block.timestamp < auction.startTime) revert AuctionNotStarted();
        if (block.timestamp >= auction.endTime) revert AuctionEnded();
        if (auction.settled) revert AuctionAlreadySettled();

        uint256 minBid = _getMinBid(auction);
        if (msg.value < minBid) revert BidTooLow(minBid);

        // Refund previous bidder
        if (auction.highestBidder != address(0)) {
            pendingReturns[auction.highestBidder][auctionId] += auction
                .highestBid;
        }

        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;

        // Anti-sniping: extend auction if bid in last 10 minutes
        _maybeExtendAuction(auctionId, auction);

        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    /**
     * @notice Place a bid with USDC
     * @param auctionId The auction to bid on
     * @param amount USDC amount (6 decimals)
     */
    function bidUSDC(uint256 auctionId, uint256 amount) external nonReentrant {
        Auction storage auction = auctions[auctionId];

        if (!auction.isUSDC) revert WrongPaymentType();
        if (block.timestamp < auction.startTime) revert AuctionNotStarted();
        if (block.timestamp >= auction.endTime) revert AuctionEnded();
        if (auction.settled) revert AuctionAlreadySettled();

        uint256 minBid = _getMinBid(auction);
        if (amount < minBid) revert BidTooLow(minBid);

        // Transfer USDC from bidder
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Refund previous bidder immediately for USDC
        if (auction.highestBidder != address(0)) {
            usdc.safeTransfer(auction.highestBidder, auction.highestBid);
        }

        auction.highestBid = amount;
        auction.highestBidder = msg.sender;

        _maybeExtendAuction(auctionId, auction);

        emit BidPlaced(auctionId, msg.sender, amount);
    }

    // ============ Settlement ============

    /**
     * @notice Settle an ended auction and register the name to winner
     * @param auctionId The auction to settle
     */
    function settle(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];

        if (block.timestamp < auction.endTime) revert AuctionNotEnded();
        if (auction.settled) revert AuctionAlreadySettled();
        if (auction.highestBidder == address(0)) revert NoBids();

        auction.settled = true;

        // Clear active auction mapping
        bytes32 nameHash = keccak256(bytes(auction.name));
        delete activeAuctions[nameHash];

        // Transfer funds to treasury
        if (auction.isUSDC) {
            usdc.safeTransfer(treasury, auction.highestBid);
        } else {
            (bool success, ) = treasury.call{value: auction.highestBid}("");
            if (!success) revert TransferFailed();
        }

        // Register the name to winner
        nameWrapper.registerAndWrapETH2LD(
            auction.name,
            auction.highestBidder,
            LIFETIME_DURATION,
            resolver,
            0 // fuses
        );

        emit AuctionSettled(
            auctionId,
            auction.highestBidder,
            auction.highestBid
        );
    }

    /**
     * @notice Cancel an auction with no bids
     * @param auctionId The auction to cancel
     */
    function cancelAuction(uint256 auctionId) external onlyOwner {
        Auction storage auction = auctions[auctionId];

        if (auction.settled) revert AuctionAlreadySettled();
        if (auction.highestBidder != address(0)) revert HasBids();

        auction.settled = true;

        bytes32 nameHash = keccak256(bytes(auction.name));
        delete activeAuctions[nameHash];

        emit AuctionCancelled(auctionId);
    }

    // ============ Withdrawals ============

    /**
     * @notice Withdraw pending returns from being outbid
     * @param auctionId The auction to withdraw from
     */
    function withdraw(uint256 auctionId) external nonReentrant {
        uint256 amount = pendingReturns[msg.sender][auctionId];
        if (amount == 0) revert NothingToWithdraw();

        pendingReturns[msg.sender][auctionId] = 0;

        // ETH auctions use pending returns, USDC refunds immediately
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    // ============ View Functions ============

    /**
     * @notice Get auction details
     */
    function getAuction(
        uint256 auctionId
    )
        external
        view
        returns (
            string memory name,
            uint256 reservePrice,
            uint256 startTime,
            uint256 endTime,
            uint256 highestBid,
            address highestBidder,
            bool settled,
            bool isUSDC
        )
    {
        Auction storage auction = auctions[auctionId];
        return (
            auction.name,
            auction.reservePrice,
            auction.startTime,
            auction.endTime,
            auction.highestBid,
            auction.highestBidder,
            auction.settled,
            auction.isUSDC
        );
    }

    /**
     * @notice Check if name has active auction
     */
    function hasActiveAuction(
        string calldata name
    ) external view returns (bool) {
        bytes32 nameHash = keccak256(bytes(name));
        uint256 auctionId = activeAuctions[nameHash];
        if (auctionId == 0) return false;

        Auction storage auction = auctions[auctionId];
        return !auction.settled && block.timestamp < auction.endTime;
    }

    /**
     * @notice Get minimum next bid for an auction
     */
    function getMinBid(uint256 auctionId) external view returns (uint256) {
        return _getMinBid(auctions[auctionId]);
    }

    // ============ Internal ============

    function _getMinBid(
        Auction storage auction
    ) internal view returns (uint256) {
        if (auction.highestBid == 0) {
            return auction.reservePrice;
        }
        return
            auction.highestBid +
            ((auction.highestBid * MIN_BID_INCREMENT_BPS) / BPS_DENOMINATOR);
    }

    function _maybeExtendAuction(
        uint256 auctionId,
        Auction storage auction
    ) internal {
        if (auction.endTime - block.timestamp < TIME_EXTENSION) {
            auction.endTime = block.timestamp + TIME_EXTENSION;
            emit AuctionExtended(auctionId, auction.endTime);
        }
    }

    // ============ Admin ============

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    receive() external payable {}
}
