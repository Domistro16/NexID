// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LaunchStakeVault} from "./LaunchStakeVault.sol";
import {NativeBinaryMarket} from "./NativeBinaryMarket.sol";

contract ResolutionManager is AccessControl, ReentrancyGuard {
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant DISPUTER_ROLE = keccak256("DISPUTER_ROLE");

    uint256 public immutable disputeWindow;
    LaunchStakeVault public immutable launchStakeVault;

    struct Proposal {
        NativeBinaryMarket.Side winner;
        address proposer;
        uint256 proposedAt;
        bool disputed;
        bool finalized;
    }

    mapping(address => Proposal) public proposals;

    event MarketClosed(address indexed market);
    event OutcomeProposed(address indexed market, NativeBinaryMarket.Side indexed winner, address indexed proposer, uint256 disputeDeadline);
    event OutcomeDisputed(address indexed market, address indexed disputer);
    event OutcomeFinalized(address indexed market, NativeBinaryMarket.Side indexed winner, bool invalid);

    constructor(address admin, LaunchStakeVault launchStakeVault_, uint256 disputeWindow_) {
        require(admin != address(0), "admin required");
        require(address(launchStakeVault_) != address(0), "stake vault required");
        require(disputeWindow_ > 0, "dispute window required");
        launchStakeVault = launchStakeVault_;
        disputeWindow = disputeWindow_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESOLVER_ROLE, admin);
        _grantRole(DISPUTER_ROLE, admin);
    }

    function closeMarket(NativeBinaryMarket market) external onlyRole(RESOLVER_ROLE) nonReentrant {
        emit MarketClosed(address(market));
        market.closeMarket();
    }

    function proposeResult(NativeBinaryMarket market, NativeBinaryMarket.Side winner) external onlyRole(RESOLVER_ROLE) nonReentrant {
        require(proposals[address(market)].proposer == address(0), "proposal exists");
        proposals[address(market)] = Proposal({
            winner: winner,
            proposer: msg.sender,
            proposedAt: block.timestamp,
            disputed: false,
            finalized: false
        });
        emit OutcomeProposed(address(market), winner, msg.sender, block.timestamp + disputeWindow);
        market.proposeResult(winner);
    }

    function disputeResult(NativeBinaryMarket market) external onlyRole(DISPUTER_ROLE) nonReentrant {
        Proposal storage proposal = proposals[address(market)];
        require(proposal.proposer != address(0), "missing proposal");
        require(!proposal.finalized, "finalized");
        require(block.timestamp <= proposal.proposedAt + disputeWindow, "window closed");
        proposal.disputed = true;
        emit OutcomeDisputed(address(market), msg.sender);
        market.markDisputed();
    }

    function finalizeUndisputed(NativeBinaryMarket market) external onlyRole(RESOLVER_ROLE) nonReentrant {
        Proposal storage proposal = proposals[address(market)];
        require(proposal.proposer != address(0), "missing proposal");
        require(!proposal.finalized, "finalized");
        require(!proposal.disputed, "disputed");
        require(block.timestamp > proposal.proposedAt + disputeWindow, "window open");
        proposal.finalized = true;
        emit OutcomeFinalized(address(market), proposal.winner, false);
        market.finalizeResult(proposal.winner, false);
        launchStakeVault.returnBond(market.stakeId());
    }

    function finalizeDisputed(NativeBinaryMarket market, NativeBinaryMarket.Side winner, bool invalid) external onlyRole(RESOLVER_ROLE) nonReentrant {
        Proposal storage proposal = proposals[address(market)];
        require(proposal.proposer != address(0), "missing proposal");
        require(proposal.disputed, "not disputed");
        require(!proposal.finalized, "finalized");
        proposal.finalized = true;
        emit OutcomeFinalized(address(market), winner, invalid);
        market.finalizeResult(winner, invalid);
        if (invalid) {
            launchStakeVault.slashBond(market.stakeId(), "invalid market");
        } else {
            launchStakeVault.returnBond(market.stakeId());
        }
    }

    function markInvalid(NativeBinaryMarket market) external onlyRole(RESOLVER_ROLE) nonReentrant {
        Proposal storage proposal = proposals[address(market)];
        if (proposal.proposer != address(0)) {
            require(!proposal.finalized, "finalized");
            proposal.finalized = true;
        }
        emit OutcomeFinalized(address(market), NativeBinaryMarket.Side.Ride, true);
        market.finalizeResult(NativeBinaryMarket.Side.Ride, true);
        launchStakeVault.slashBond(market.stakeId(), "invalid market");
    }
}
