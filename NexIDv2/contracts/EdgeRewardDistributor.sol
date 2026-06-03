// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract EdgeRewardDistributor is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant AUTHORIZER_ROLE = keccak256("AUTHORIZER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint8 public constant ACTION_CLAIM = 1;
    uint8 public constant ACTION_SPEND_ID_MINT = 2;

    bytes32 public constant REWARD_AUTHORIZATION_TYPEHASH = keccak256(
        "RewardAuthorization(address account,address recipient,uint256 amount,bytes32 idNameHash,bytes32 authorizationId,uint8 action,uint256 deadline)"
    );

    IERC20 public immutable rewardToken;
    mapping(bytes32 => bool) public usedAuthorizations;

    struct RewardAuthorization {
        address account;
        address recipient;
        uint256 amount;
        bytes32 idNameHash;
        bytes32 authorizationId;
        uint8 action;
        uint256 deadline;
    }

    event RewardClaimed(
        address indexed account,
        address indexed recipient,
        uint256 amount,
        bytes32 indexed authorizationId,
        bytes32 idNameHash
    );
    event RewardSpentForIdMint(
        address indexed account,
        address indexed recipient,
        uint256 amount,
        bytes32 indexed authorizationId,
        bytes32 idNameHash
    );
    event AuthorizationConsumed(bytes32 indexed authorizationId, address indexed signer, uint8 action);

    constructor(IERC20 rewardToken_, address admin, address authorizer) EIP712("NexMarketsEdgeRewardDistributor", "1") {
        require(address(rewardToken_) != address(0), "reward token required");
        require(admin != address(0), "admin required");
        require(authorizer != address(0), "authorizer required");
        rewardToken = rewardToken_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(AUTHORIZER_ROLE, authorizer);
    }

    function claim(RewardAuthorization calldata authorization, bytes calldata signature) external nonReentrant whenNotPaused {
        _consumeAuthorization(authorization, signature, ACTION_CLAIM);
        require(authorization.recipient == authorization.account, "claim recipient must be account");
        rewardToken.safeTransfer(authorization.recipient, authorization.amount);
        emit RewardClaimed(
            authorization.account,
            authorization.recipient,
            authorization.amount,
            authorization.authorizationId,
            authorization.idNameHash
        );
    }

    function spendForIdMint(RewardAuthorization calldata authorization, bytes calldata signature) external nonReentrant whenNotPaused {
        _consumeAuthorization(authorization, signature, ACTION_SPEND_ID_MINT);
        rewardToken.safeTransfer(authorization.recipient, authorization.amount);
        emit RewardSpentForIdMint(
            authorization.account,
            authorization.recipient,
            authorization.amount,
            authorization.authorizationId,
            authorization.idNameHash
        );
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function recoverUnsupportedToken(IERC20 token, address recipient, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(token) != address(rewardToken), "cannot recover reward token");
        require(recipient != address(0), "recipient required");
        token.safeTransfer(recipient, amount);
    }

    function _consumeAuthorization(
        RewardAuthorization calldata authorization,
        bytes calldata signature,
        uint8 expectedAction
    ) private {
        require(authorization.account != address(0), "account required");
        require(authorization.recipient != address(0), "recipient required");
        require(authorization.amount > 0, "amount required");
        require(authorization.idNameHash != bytes32(0), "id name hash required");
        require(authorization.authorizationId != bytes32(0), "authorization id required");
        require(authorization.action == expectedAction, "wrong reward action");
        require(block.timestamp <= authorization.deadline, "authorization expired");
        require(!usedAuthorizations[authorization.authorizationId], "authorization used");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            REWARD_AUTHORIZATION_TYPEHASH,
            authorization.account,
            authorization.recipient,
            authorization.amount,
            authorization.idNameHash,
            authorization.authorizationId,
            authorization.action,
            authorization.deadline
        )));
        address signer = ECDSA.recover(digest, signature);
        require(hasRole(AUTHORIZER_ROLE, signer), "bad reward authorization");

        usedAuthorizations[authorization.authorizationId] = true;
        emit AuthorizationConsumed(authorization.authorizationId, signer, authorization.action);
    }
}
