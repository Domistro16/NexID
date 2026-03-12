// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ENS} from "../../registry/ENS.sol";
import {ABIResolver} from "../../resolvers/profiles/ABIResolver.sol";
import {AddrResolver} from "../../resolvers/profiles/AddrResolver.sol";
import {
    ContentHashResolver
} from "../../resolvers/profiles/ContentHashResolver.sol";
import {DNSResolver} from "../../resolvers/profiles/DNSResolver.sol";
import {
    InterfaceResolver
} from "../../resolvers/profiles/InterfaceResolver.sol";
import {NameResolver} from "../../resolvers/profiles/NameResolver.sol";
import {PubkeyResolver} from "../../resolvers/profiles/PubkeyResolver.sol";
import {TextResolver} from "../../resolvers/profiles/TextResolver.sol";
import {Multicallable} from "../../resolvers/Multicallable.sol";
import {ReverseClaimer} from "../../reverseRegistrar/ReverseClaimer.sol";
import {INameWrapper} from "../../wrapper/INameWrapper.sol";
import {PaymentResolver} from "./PaymentResolver.sol";

/**
 * @title AgentPublicResolver
 * @notice Full-featured resolver with all standard profiles plus payment support
 * @dev Extends the standard PublicResolver with PaymentResolver for agent payments
 */
contract AgentPublicResolver is
    Multicallable,
    ABIResolver,
    AddrResolver,
    ContentHashResolver,
    DNSResolver,
    InterfaceResolver,
    NameResolver,
    PubkeyResolver,
    TextResolver,
    PaymentResolver,
    ReverseClaimer
{
    ENS immutable ens;
    INameWrapper immutable nameWrapper;
    address immutable trustedAgentController;
    address immutable trustedReverseRegistrar;

    /**
     * @notice Operator approvals
     * @dev (owner, operator) => approved
     */
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    /**
     * @notice Token approvals (per-name delegation)
     * @dev (owner, node, delegate) => approved
     */
    mapping(address => mapping(bytes32 => mapping(address => bool)))
        private _tokenApprovals;

    // ============ Events ============

    event ApprovalForAll(
        address indexed owner,
        address indexed operator,
        bool approved
    );

    event Approved(
        address owner,
        bytes32 indexed node,
        address indexed delegate,
        bool indexed approved
    );

    // ============ Constructor ============

    constructor(
        ENS _ens,
        INameWrapper wrapperAddress,
        address _trustedAgentController,
        address _trustedReverseRegistrar
    ) ReverseClaimer(_ens, msg.sender) {
        ens = _ens;
        nameWrapper = wrapperAddress;
        trustedAgentController = _trustedAgentController;
        trustedReverseRegistrar = _trustedReverseRegistrar;
    }

    // ============ Approval Functions ============

    /**
     * @notice Set approval for an operator to manage all names
     * @param operator The operator address
     * @param approved Whether to approve or revoke
     */
    function setApprovalForAll(address operator, bool approved) external {
        require(msg.sender != operator, "Setting approval for self");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /**
     * @notice Check if an operator is approved for all names
     * @param account The owner address
     * @param operator The operator address
     * @return True if approved
     */
    function isApprovedForAll(
        address account,
        address operator
    ) public view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    /**
     * @notice Approve a delegate for a specific name
     * @param node The name node
     * @param delegate The delegate address
     * @param approved Whether to approve or revoke
     */
    function approve(bytes32 node, address delegate, bool approved) external {
        require(msg.sender != delegate, "Setting delegate for self");
        _tokenApprovals[msg.sender][node][delegate] = approved;
        emit Approved(msg.sender, node, delegate, approved);
    }

    /**
     * @notice Check if a delegate is approved for a specific name
     * @param owner The owner address
     * @param node The name node
     * @param delegate The delegate address
     * @return True if approved
     */
    function isApprovedFor(
        address owner,
        bytes32 node,
        address delegate
    ) public view returns (bool) {
        return _tokenApprovals[owner][node][delegate];
    }

    // ============ Authorization ============

    /**
     * @notice Check if caller is authorized to modify a node
     * @param node The node to check
     * @return True if authorized
     */
    function isAuthorised(bytes32 node) internal view override returns (bool) {
        // Trusted controllers can always modify
        if (
            msg.sender == trustedAgentController ||
            msg.sender == trustedReverseRegistrar
        ) {
            return true;
        }

        // Get owner from registry or wrapper
        address owner = ens.owner(node);
        if (owner == address(nameWrapper)) {
            owner = nameWrapper.ownerOf(uint256(node));
        }

        // Check ownership and approvals
        return
            owner == msg.sender ||
            isApprovedForAll(owner, msg.sender) ||
            isApprovedFor(owner, node, msg.sender);
    }

    // ============ IERC165 ============

    function supportsInterface(
        bytes4 interfaceID
    )
        public
        view
        override(
            Multicallable,
            ABIResolver,
            AddrResolver,
            ContentHashResolver,
            DNSResolver,
            InterfaceResolver,
            NameResolver,
            PubkeyResolver,
            TextResolver,
            PaymentResolver
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceID);
    }
}
