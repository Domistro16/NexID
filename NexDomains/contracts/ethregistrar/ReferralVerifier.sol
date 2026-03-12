// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface INameWrapper {
    function ownerOf(uint256 id) external view returns (address);
}

interface IBaseRegistrar {
    function nameExpires(uint256 id) external view returns (uint256);
}

contract ReferralVerifier is Ownable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant BASE_PCT = 25;
    uint256 public constant BONUS_PCT = 30;
    uint256 public constant BONUS_THRESHOLD = 5;

    // ============ State ============
    address public signer;
    INameWrapper public nameWrapper;
    IBaseRegistrar public baseRegistrar;

    mapping(bytes32 => bool) public usedNonces;
    mapping(address => uint256) public referralCount;
    mapping(address => uint256) public totalEarnings;

    // Referral relationship storage
    // referredDomainHash => ReferralInfo
    struct ReferralInfo {
        bytes32 referrerCodeHash; // The domain hash used as referral code (e.g., hash of "vitalik")
        address originalReferrer; // The address that owned the referral code at registration time
    }
    mapping(bytes32 => ReferralInfo) public domainReferrals;

    // Fiat tracking
    uint256 public untrackedFiatEarnings;
    mapping(address => uint256) public pendingFiatEarnings;

    // Controllers
    mapping(address => bool) public controllers;

    // ============ Events ============
    event ReferralPaid(
        address indexed referrer,
        address indexed registrant,
        bytes32 indexed nameHash,
        uint256 amount,
        address token,
        bool isFiat
    );
    event RenewalReferralPaid(
        address indexed referrer,
        bytes32 indexed nameHash,
        bytes32 indexed referrerCodeHash,
        uint256 amount,
        address token,
        bool isFiat
    );
    event RenewalReferralSkipped(
        bytes32 indexed nameHash,
        bytes32 indexed referrerCodeHash,
        address originalReferrer,
        address currentOwner,
        string reason
    );
    event ReferrerAssigned(
        bytes32 indexed nameHash,
        bytes32 indexed referrerCodeHash,
        address indexed referrer
    );
    event SignerUpdated(address oldSigner, address newSigner);
    event ExcessRefunded(address indexed to, uint256 amount);
    event ControllerUpdated(address indexed controller, bool allowed);

    // ============ Errors ============
    error InvalidSignature();
    error ExpiredSignature();
    error NonceAlreadyUsed();
    error SelfReferral();
    error InvalidAddress();
    error TransferFailed();
    error NotController();

    // ============ Structs ============
    struct ReferralData {
        address referrer;
        address registrant;
        bytes32 nameHash; // Hash of domain being registered
        bytes32 referrerCodeHash; // Hash of the referral code domain
        uint256 deadline;
        bytes32 nonce;
    }

    // ============ Modifiers ============
    modifier onlyController() {
        if (!controllers[msg.sender] && msg.sender != owner())
            revert NotController();
        _;
    }

    constructor(address _signer, address _nameWrapper, address _baseRegistrar) {
        if (_signer == address(0)) revert InvalidAddress();
        if (_nameWrapper == address(0)) revert InvalidAddress();
        if (_baseRegistrar == address(0)) revert InvalidAddress();

        signer = _signer;
        nameWrapper = INameWrapper(_nameWrapper);
        baseRegistrar = IBaseRegistrar(_baseRegistrar);
    }

    // ============ Admin ============

    function setSigner(address _signer) external onlyOwner {
        if (_signer == address(0)) revert InvalidAddress();
        emit SignerUpdated(signer, _signer);
        signer = _signer;
    }

    function setNameWrapper(address _nameWrapper) external onlyOwner {
        if (_nameWrapper == address(0)) revert InvalidAddress();
        nameWrapper = INameWrapper(_nameWrapper);
    }

    function setBaseRegistrar(address _baseRegistrar) external onlyOwner {
        if (_baseRegistrar == address(0)) revert InvalidAddress();
        baseRegistrar = IBaseRegistrar(_baseRegistrar);
    }

    function setController(
        address controller,
        bool allowed
    ) external onlyOwner {
        if (controller == address(0)) revert InvalidAddress();
        controllers[controller] = allowed;
        emit ControllerUpdated(controller, allowed);
    }

    // ============ Core Functions ============

    /// @notice Check if a referrer still owns their referral code domain
    function isReferrerValid(
        bytes32 referrerCodeHash,
        address originalReferrer
    )
        public
        view
        returns (bool valid, address currentOwner, string memory reason)
    {
        uint256 tokenId = uint256(referrerCodeHash);

        // Check current owner
        try nameWrapper.ownerOf(tokenId) returns (address owner) {
            currentOwner = owner;
        } catch {
            return (false, address(0), "Domain does not exist");
        }

        // Check if expired
        uint256 expiry = baseRegistrar.nameExpires(tokenId);
        if (block.timestamp > expiry) {
            return (false, currentOwner, "Referral domain expired");
        }

        // Check if still owned by original referrer
        if (currentOwner != originalReferrer) {
            return (false, currentOwner, "Referrer no longer owns domain");
        }

        return (true, currentOwner, "");
    }

    /// @notice Process referral for NEW registrations (requires signature)
    function processReferral(
        ReferralData calldata data,
        bytes calldata signature,
        uint256 totalPrice,
        address token,
        bool isFiat
    ) external payable onlyController returns (uint256 paidAmount) {
        // Skip if no referrer
        if (data.referrer == address(0)) {
            _refundExcess(token);
            return 0;
        }

        // Validations
        if (data.referrer == data.registrant) revert SelfReferral();
        if (block.timestamp > data.deadline) revert ExpiredSignature();
        if (usedNonces[data.nonce]) revert NonceAlreadyUsed();

        // Verify signature (now includes referrerCodeHash)
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                data.referrer,
                data.registrant,
                data.nameHash,
                data.referrerCodeHash,
                data.deadline,
                data.nonce,
                block.chainid,
                address(this)
            )
        );

        bytes32 ethSignedHash = ECDSA.toEthSignedMessageHash(messageHash);
        address recoveredSigner = ECDSA.recover(ethSignedHash, signature);

        if (recoveredSigner != signer) revert InvalidSignature();

        // Mark nonce as used
        usedNonces[data.nonce] = true;

        // Store referral relationship permanently
        if (domainReferrals[data.nameHash].originalReferrer == address(0)) {
            domainReferrals[data.nameHash] = ReferralInfo({
                referrerCodeHash: data.referrerCodeHash,
                originalReferrer: data.referrer
            });
            emit ReferrerAssigned(
                data.nameHash,
                data.referrerCodeHash,
                data.referrer
            );
        }

        // Calculate payout
        uint256 pct = referralCount[data.referrer] >= BONUS_THRESHOLD
            ? BONUS_PCT
            : BASE_PCT;
        paidAmount = (totalPrice * pct) / 100;

        // Increment referral count and track earnings
        referralCount[data.referrer]++;
        totalEarnings[data.referrer] += paidAmount;

        // Process payment
        _processPayment(data.referrer, paidAmount, token, isFiat);

        emit ReferralPaid(
            data.referrer,
            data.registrant,
            data.nameHash,
            paidAmount,
            token,
            isFiat
        );

        return paidAmount;
    }

    /// @notice Process referral for RENEWALS (checks if referrer still owns their domain)
    function processRenewalReferral(
        bytes32 nameHash,
        uint256 totalPrice,
        address token,
        bool isFiat
    ) external payable onlyController returns (uint256 paidAmount) {
        // Look up stored referral info
        ReferralInfo memory info = domainReferrals[nameHash];

        // No referral relationship exists
        if (info.originalReferrer == address(0)) {
            _refundExcess(token);
            return 0;
        }

        // Check if referrer still owns their referral code domain
        (
            bool valid,
            address currentOwner,
            string memory reason
        ) = isReferrerValid(info.referrerCodeHash, info.originalReferrer);

        if (!valid) {
            emit RenewalReferralSkipped(
                nameHash,
                info.referrerCodeHash,
                info.originalReferrer,
                currentOwner,
                reason
            );
            _refundExcess(token);
            return 0;
        }

        // Calculate payout
        uint256 pct = referralCount[info.originalReferrer] >= BONUS_THRESHOLD
            ? BONUS_PCT
            : BASE_PCT;
        paidAmount = (totalPrice * pct) / 100;

        // Track earnings (don't increment referral count for renewals)
        totalEarnings[info.originalReferrer] += paidAmount;

        // Process payment
        _processPayment(info.originalReferrer, paidAmount, token, isFiat);

        emit RenewalReferralPaid(
            info.originalReferrer,
            nameHash,
            info.referrerCodeHash,
            paidAmount,
            token,
            isFiat
        );

        return paidAmount;
    }

    /// @notice Refund any excess ETH/tokens sent
    function _refundExcess(address token) internal {
        if (token == address(0)) {
            if (msg.value > 0) {
                (bool refunded, ) = payable(msg.sender).call{value: msg.value}(
                    ""
                );
                require(refunded, "Refund failed");
            }
        } else {
            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                IERC20(token).safeTransfer(msg.sender, balance);
            }
        }
    }

    /// @notice Internal payment processing
    function _processPayment(
        address referrer,
        uint256 paidAmount,
        address token,
        bool isFiat
    ) internal {
        if (isFiat) {
            pendingFiatEarnings[referrer] += paidAmount;
            untrackedFiatEarnings += paidAmount;
        } else if (token == address(0)) {
            require(msg.value >= paidAmount, "Insufficient ETH for referral");

            (bool success, ) = payable(referrer).call{value: paidAmount}("");
            if (!success) revert TransferFailed();

            uint256 excess = msg.value - paidAmount;
            if (excess > 0) {
                (bool refunded, ) = payable(msg.sender).call{value: excess}("");
                require(refunded, "Excess refund failed");
                emit ExcessRefunded(msg.sender, excess);
            }
        } else {
            uint256 balance = IERC20(token).balanceOf(address(this));
            require(balance >= paidAmount, "Insufficient tokens for referral");

            IERC20(token).safeTransfer(referrer, paidAmount);

            uint256 excessTokens = balance - paidAmount;
            if (excessTokens > 0) {
                IERC20(token).safeTransfer(msg.sender, excessTokens);
            }
        }
    }

    /// @notice Batch distribute fiat earnings
    function distributeFiatEarnings(
        address[] calldata referrers,
        uint256[] calldata amounts
    ) external payable onlyOwner {
        require(referrers.length == amounts.length, "Length mismatch");

        uint256 totalDistributed = 0;

        for (uint256 i = 0; i < referrers.length; i++) {
            address referrer = referrers[i];
            uint256 amount = amounts[i];

            if (amount > pendingFiatEarnings[referrer]) {
                amount = pendingFiatEarnings[referrer];
            }

            if (amount > 0) {
                pendingFiatEarnings[referrer] -= amount;
                totalDistributed += amount;

                (bool success, ) = payable(referrer).call{value: amount}("");
                require(success, "Transfer failed");
            }
        }

        untrackedFiatEarnings -= totalDistributed;
    }

    // ============ View Functions ============

    function getReferralPct(address referrer) external view returns (uint256) {
        return
            referralCount[referrer] >= BONUS_THRESHOLD ? BONUS_PCT : BASE_PCT;
    }

    function getDomainReferralInfo(
        bytes32 nameHash
    )
        external
        view
        returns (
            bytes32 referrerCodeHash,
            address originalReferrer,
            bool isCurrentlyValid,
            address currentCodeOwner,
            string memory validityReason
        )
    {
        ReferralInfo memory info = domainReferrals[nameHash];
        referrerCodeHash = info.referrerCodeHash;
        originalReferrer = info.originalReferrer;

        if (originalReferrer != address(0)) {
            (
                isCurrentlyValid,
                currentCodeOwner,
                validityReason
            ) = isReferrerValid(referrerCodeHash, originalReferrer);
        }
    }

    function verifySignature(
        ReferralData calldata data,
        bytes calldata signature
    ) external view returns (bool) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                data.referrer,
                data.registrant,
                data.nameHash,
                data.referrerCodeHash,
                data.deadline,
                data.nonce,
                block.chainid,
                address(this)
            )
        );

        bytes32 ethSignedHash = ECDSA.toEthSignedMessageHash(messageHash);
        return ECDSA.recover(ethSignedHash, signature) == signer;
    }

    // ============ Emergency ============

    function withdrawStuckETH() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}(
            ""
        );
        require(success, "Withdraw failed");
    }

    function withdrawStuckTokens(address token) external onlyOwner {
        IERC20(token).safeTransfer(
            owner(),
            IERC20(token).balanceOf(address(this))
        );
    }

    receive() external payable {}
}
