// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseRegistrarImplementation} from "./BaseRegistrarImplementation.sol";
import {StringUtils} from "../utils/StringUtils.sol";
import {Resolver} from "../resolvers/Resolver.sol";
import {ENS} from "../registry/ENS.sol";
import {ReverseRegistrar} from "../reverseRegistrar/ReverseRegistrar.sol";
import {ReverseClaimer} from "../reverseRegistrar/ReverseClaimer.sol";
import {
    IETHRegistrarController,
    IPriceOracle
} from "./IETHRegistrarController.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {INameWrapper} from "../wrapper/INameWrapper.sol";
import {ERC20Recoverable} from "../utils/ERC20Recoverable.sol";
import {TokenPriceOracle} from "./TokenPriceOracle.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReferralVerifier} from "./ReferralVerifier.sol";
import {Airdrop} from "./Airdrop.sol";

error CommitmentTooNew(bytes32 commitment);
error CommitmentTooOld(bytes32 commitment);
error NameNotAvailable(string name);
error DurationTooShort(uint256 duration);
error ResolverRequiredWhenDataSupplied();
error UnexpiredCommitmentExists(bytes32 commitment);
error InsufficientValue();
error MaxCommitmentAgeTooLow();
error MaxCommitmentAgeTooHigh();

contract ETHRegistrarController is
    Ownable,
    IETHRegistrarController,
    IERC165,
    ERC20Recoverable,
    ReverseClaimer
{
    using StringUtils for *;
    using Address for address;
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant MIN_REGISTRATION_DURATION = 28 days;
    uint256 private constant LIFETIME_DURATION = 31536000000;
    uint256 private constant MAX_REFERRAL_PCT = 30;
    bytes32 private constant ETH_NODE =
        0xe3f6fa8ec34a0592261cf8313365d7f76784e190d0c33fbd4d51f8461a9b8e54;

    // ============ Immutables ============
    BaseRegistrarImplementation public immutable base;
    uint256 public immutable minCommitmentAge;
    uint256 public immutable maxCommitmentAge;
    ReverseRegistrar public immutable reverseRegistrar;
    INameWrapper public immutable nameWrapper;

    // ============ State ============
    TokenPriceOracle public prices;
    ReferralVerifier public referralVerifier;
    address public backendWallet;
    address public infoFi;
    Airdrop public airdrop;
    bool public useAirdrop;
    uint256 public mints;
    uint256 public untrackedInfoFi;

    mapping(bytes32 => uint256) public commitments;
    mapping(address => Token) public verifiedTokens;

    // ============ Structs ============
    struct Token {
        string token;
        address tokenAddress;
    }

    // ============ Events ============
    event NameRegistered(
        string name,
        bytes32 indexed label,
        address indexed owner,
        uint256 baseCost,
        uint256 premium,
        uint256 expires
    );
    event NameRenewed(
        string name,
        bytes32 indexed label,
        uint256 cost,
        uint256 expires
    );

    // ============ Modifiers ============
    modifier onlyBackend() {
        require(msg.sender == backendWallet, "Not Backend");
        _;
    }

    constructor(
        BaseRegistrarImplementation _base,
        TokenPriceOracle _prices,
        uint256 _minCommitmentAge,
        uint256 _maxCommitmentAge,
        ReverseRegistrar _reverseRegistrar,
        INameWrapper _nameWrapper,
        ENS _ens,
        ReferralVerifier _referralVerifier
    ) ReverseClaimer(_ens, msg.sender) {
        if (_maxCommitmentAge <= _minCommitmentAge) {
            revert MaxCommitmentAgeTooLow();
        }
        if (_maxCommitmentAge > block.timestamp) {
            revert MaxCommitmentAgeTooHigh();
        }

        base = _base;
        prices = _prices;
        minCommitmentAge = _minCommitmentAge;
        maxCommitmentAge = _maxCommitmentAge;
        reverseRegistrar = _reverseRegistrar;
        nameWrapper = _nameWrapper;
        referralVerifier = _referralVerifier;
    }

    // ============ Admin ============

    function setAirdrop(Airdrop _airdrop) external onlyOwner {
        airdrop = _airdrop;
    }

    function controlAirdrop(bool enabled) external onlyOwner {
        useAirdrop = enabled;
    }

    function setBackend(address wallet) external onlyOwner {
        backendWallet = wallet;
    }

    function setOracle(address oracle) external onlyOwner {
        prices = TokenPriceOracle(oracle);
    }

    function setReferralVerifier(address _verifier) external onlyOwner {
        referralVerifier = ReferralVerifier(payable(_verifier));
    }

    function setToken(
        Token memory token,
        address tokenAddress
    ) external onlyOwner {
        verifiedTokens[tokenAddress] = token;
    }

    function removeToken(address tokenAddress) external onlyOwner {
        delete verifiedTokens[tokenAddress];
    }

    function setInfoFi(address _infoFi) external onlyOwner {
        infoFi = _infoFi;
    }

    // ============ View Functions ============

    function rentPrice(
        string memory name,
        uint256 duration,
        bool lifetime
    ) public view returns (IPriceOracle.Price memory) {
        require(
            duration == 0 || duration >= MIN_REGISTRATION_DURATION,
            "Invalid duration"
        );
        return
            prices.price(
                name,
                base.nameExpires(uint256(keccak256(bytes(name)))),
                duration,
                lifetime
            );
    }

    function rentPriceToken(
        string memory name,
        uint256 duration,
        string memory token,
        bool lifetime
    ) public view returns (IPriceOracle.Price memory) {
        require(
            duration == 0 || duration >= MIN_REGISTRATION_DURATION,
            "Invalid duration"
        );
        return
            prices.priceToken(
                name,
                base.nameExpires(uint256(keccak256(bytes(name)))),
                duration,
                token,
                lifetime
            );
    }

    function valid(string memory name) public pure returns (bool) {
        return name.strlen() >= 2;
    }

    function available(string memory name) public view returns (bool) {
        bytes32 label = keccak256(bytes(name));
        return valid(name) && base.available(uint256(label));
    }

    function makeCommitment(
        IETHRegistrarController.RegisterRequest calldata req
    ) public pure returns (bytes32) {
        if (req.data.length > 0 && req.resolver == address(0)) {
            revert ResolverRequiredWhenDataSupplied();
        }
        return
            keccak256(
                abi.encode(
                    keccak256(bytes(req.name)),
                    req.owner,
                    req.duration,
                    req.secret,
                    req.resolver,
                    req.data,
                    req.reverseRecord,
                    req.ownerControlledFuses,
                    req.lifetime
                )
            );
    }

    function commit(bytes32 commitment) public {
        if (commitments[commitment] + maxCommitmentAge >= block.timestamp) {
            revert UnexpiredCommitmentExists(commitment);
        }
        commitments[commitment] = block.timestamp;
    }

    // ============ Registration ============

    function register(
        IETHRegistrarController.RegisterRequest calldata req,
        ReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature
    ) external payable {
        (uint256 totalPrice, uint256 expires) = _executeRegistration(req);

        _handleReferral(referralData, referralSignature, totalPrice, false);
        _refundExcess(totalPrice);
        mints++;
    }

    function registerWithCard(
        IETHRegistrarController.RegisterRequest calldata req,
        ReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature
    ) external onlyBackend {
        (uint256 totalPrice, ) = _executeRegistration(req);

        if (mints > 1000) {
            _handleReferral(referralData, referralSignature, totalPrice, true);
        }
        untrackedInfoFi += (totalPrice * 35) / 100;
        mints++;
    }

    function registerWithToken(
        IETHRegistrarController.RegisterRequest calldata req,
        address tokenAddress,
        ReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature
    ) external {
        require(
            verifiedTokens[tokenAddress].tokenAddress != address(0),
            "Unaccepted Token"
        );

        (uint256 totalPrice, ) = _executeTokenRegistration(req, tokenAddress);

        _handleTokenReferral(
            referralData,
            referralSignature,
            totalPrice,
            tokenAddress
        );
        mints++;
    }

    // ============ Internal Registration Logic ============

    function _executeRegistration(
        IETHRegistrarController.RegisterRequest calldata req
    ) internal returns (uint256 totalPrice, uint256 expires) {
        uint256 duration = req.lifetime ? LIFETIME_DURATION : req.duration;

        IPriceOracle.Price memory price = rentPrice(
            req.name,
            duration,
            req.lifetime
        );
        totalPrice = price.base + price.premium;

        if (msg.value < totalPrice) revert InsufficientValue();

        _consumeCommitment(req.name, duration, makeCommitment(req));

        expires = nameWrapper.registerAndWrapETH2LD(
            req.name,
            req.owner,
            duration,
            req.resolver,
            req.ownerControlledFuses
        );

        _finalizeRegistration(req, price, expires);
    }

    function _executeTokenRegistration(
        IETHRegistrarController.RegisterRequest calldata req,
        address tokenAddress
    ) internal returns (uint256 totalPrice, uint256 expires) {
        uint256 duration = req.lifetime ? LIFETIME_DURATION : req.duration;
        Token memory t = verifiedTokens[tokenAddress];

        IPriceOracle.Price memory price = rentPriceToken(
            req.name,
            duration,
            t.token,
            req.lifetime
        );
        totalPrice = price.base + price.premium;

        if (IERC20(tokenAddress).balanceOf(msg.sender) < totalPrice)
            revert InsufficientValue();

        _consumeCommitment(req.name, duration, makeCommitment(req));

        IERC20(tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            totalPrice
        );

        expires = nameWrapper.registerAndWrapETH2LD(
            req.name,
            req.owner,
            duration,
            req.resolver,
            req.ownerControlledFuses
        );

        _finalizeRegistration(req, price, expires);
    }

    function _finalizeRegistration(
        IETHRegistrarController.RegisterRequest calldata req,
        IPriceOracle.Price memory price,
        uint256 expires
    ) internal {
        bytes32 label = keccak256(bytes(req.name));

        if (req.data.length > 0) {
            _setRecords(req.resolver, label, req.data);
        }

        if (req.reverseRecord) {
            _setReverseRecord(req.name, req.resolver, msg.sender);
        }

        _updatePoints(
            req.name,
            req.lifetime ? LIFETIME_DURATION : req.duration,
            req.owner,
            req.lifetime
        );

        emit NameRegistered(
            req.name,
            label,
            req.owner,
            price.base,
            price.premium,
            expires
        );
    }

    // ============ Renewal ============

    function renew(
        string calldata name,
        uint256 duration,
        bool lifetime
    ) external payable {
        uint256 actualDuration = lifetime ? LIFETIME_DURATION : duration;
        bytes32 labelhash = keccak256(bytes(name));

        IPriceOracle.Price memory price = rentPrice(
            name,
            actualDuration,
            lifetime
        );
        uint256 totalPrice = price.base + price.premium;

        if (msg.value < totalPrice) revert InsufficientValue();

        uint256 expires = nameWrapper.renew(uint256(labelhash), actualDuration);
        emit NameRenewed(name, labelhash, totalPrice, expires);

        _handleRenewalReferral(labelhash, totalPrice, false);
        _refundExcess(totalPrice);
    }

    function renewCard(
        string calldata name,
        uint256 duration,
        bool lifetime
    ) external onlyBackend {
        uint256 actualDuration = lifetime ? LIFETIME_DURATION : duration;
        bytes32 labelhash = keccak256(bytes(name));

        IPriceOracle.Price memory price = rentPrice(
            name,
            actualDuration,
            lifetime
        );
        uint256 totalPrice = price.base + price.premium;

        uint256 expires = nameWrapper.renew(uint256(labelhash), actualDuration);
        emit NameRenewed(name, labelhash, totalPrice, expires);

        _handleRenewalReferral(labelhash, totalPrice, true);
        untrackedInfoFi += (totalPrice * 35) / 100;
    }

    function renewTokens(
        string calldata name,
        uint256 duration,
        address tokenAddress,
        bool lifetime
    ) external {
        require(
            verifiedTokens[tokenAddress].tokenAddress != address(0),
            "Unaccepted Token"
        );

        uint256 actualDuration = lifetime ? LIFETIME_DURATION : duration;
        bytes32 labelhash = keccak256(bytes(name));
        Token memory t = verifiedTokens[tokenAddress];

        IPriceOracle.Price memory price = rentPriceToken(
            name,
            actualDuration,
            t.token,
            lifetime
        );
        uint256 totalPrice = price.base + price.premium;

        if (IERC20(tokenAddress).balanceOf(msg.sender) < totalPrice)
            revert InsufficientValue();

        IERC20(tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            totalPrice
        );

        uint256 expires = nameWrapper.renew(uint256(labelhash), actualDuration);
        emit NameRenewed(name, labelhash, totalPrice, expires);

        _handleRenewalTokenReferral(labelhash, totalPrice, tokenAddress);
    }

    // ============ Referral Handlers ============

    function _handleReferral(
        ReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature,
        uint256 totalPrice,
        bool isFiat
    ) internal {
        if (
            referralData.referrer == address(0) || referralSignature.length == 0
        ) return;

        uint256 amount = (totalPrice * MAX_REFERRAL_PCT) / 100;

        if (!isFiat) {
            referralVerifier.processReferral{value: amount}(
                referralData,
                referralSignature,
                totalPrice,
                address(0),
                false
            );
        } else {
            referralVerifier.processReferral(
                referralData,
                referralSignature,
                totalPrice,
                address(0),
                true
            );
        }
    }

    function _handleTokenReferral(
        ReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature,
        uint256 totalPrice,
        address tokenAddress
    ) internal {
        if (
            referralData.referrer == address(0) || referralSignature.length == 0
        ) return;

        uint256 amount = (totalPrice * MAX_REFERRAL_PCT) / 100;
        IERC20(tokenAddress).safeTransfer(address(referralVerifier), amount);

        referralVerifier.processReferral(
            referralData,
            referralSignature,
            totalPrice,
            tokenAddress,
            false
        );
    }

    function _handleRenewalReferral(
        bytes32 nameHash,
        uint256 totalPrice,
        bool isFiat
    ) internal {
        (, address originalReferrer, bool isValid, , ) = referralVerifier
            .getDomainReferralInfo(nameHash);
        if (originalReferrer == address(0) || !isValid) return;

        uint256 amount = (totalPrice * MAX_REFERRAL_PCT) / 100;

        if (!isFiat) {
            referralVerifier.processRenewalReferral{value: amount}(
                nameHash,
                totalPrice,
                address(0),
                false
            );
        } else {
            referralVerifier.processRenewalReferral(
                nameHash,
                totalPrice,
                address(0),
                true
            );
        }
    }

    function _handleRenewalTokenReferral(
        bytes32 nameHash,
        uint256 totalPrice,
        address tokenAddress
    ) internal {
        (, address originalReferrer, bool isValid, , ) = referralVerifier
            .getDomainReferralInfo(nameHash);
        if (originalReferrer == address(0) || !isValid) return;

        uint256 amount = (totalPrice * MAX_REFERRAL_PCT) / 100;
        IERC20(tokenAddress).safeTransfer(address(referralVerifier), amount);

        referralVerifier.processRenewalReferral(
            nameHash,
            totalPrice,
            tokenAddress,
            false
        );
    }

    // ============ Internal Utilities ============

    function _refundExcess(uint256 totalPrice) internal {
        if (msg.value > totalPrice) {
            (bool success, ) = payable(msg.sender).call{
                value: msg.value - totalPrice
            }("");
            require(success, "Refund failed");
        }
    }

    function _updatePoints(
        string memory name,
        uint256 duration,
        address owner,
        bool lifetime
    ) internal {
        if (!useAirdrop) return;

        uint256 len = name.strlen();
        uint256 point = len == 2
            ? 100
            : len == 3
                ? 50
                : len == 4
                    ? 20
                    : 10;
        uint256 points = point * (lifetime ? 3 : duration / 31536000);

        airdrop.updatePoints(owner, points);
    }

    function _consumeCommitment(
        string memory name,
        uint256 duration,
        bytes32 commitment
    ) internal {
        if (commitments[commitment] + minCommitmentAge > block.timestamp) {
            revert CommitmentTooNew(commitment);
        }
        if (commitments[commitment] + maxCommitmentAge <= block.timestamp) {
            revert CommitmentTooOld(commitment);
        }
        if (!available(name)) {
            revert NameNotAvailable(name);
        }

        delete commitments[commitment];

        if (duration != 0 && duration < MIN_REGISTRATION_DURATION) {
            revert DurationTooShort(duration);
        }
    }

    function _setRecords(
        address resolverAddress,
        bytes32 label,
        bytes[] memory data
    ) internal {
        bytes32 nodehash = keccak256(abi.encodePacked(ETH_NODE, label));
        Resolver(resolverAddress).multicallWithNodeCheck(nodehash, data);
    }

    function _setReverseRecord(
        string memory name,
        address resolver,
        address owner
    ) internal {
        reverseRegistrar.setNameForAddr(
            msg.sender,
            owner,
            resolver,
            string.concat(name, ".id")
        );
    }

    // ============ Withdraw ============

    function withdraw() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}(
            ""
        );
        require(success, "Transfer failed");
    }

    function withdrawTokens(address tokenAddress) external onlyOwner {
        IERC20(tokenAddress).safeTransfer(
            owner(),
            IERC20(tokenAddress).balanceOf(address(this))
        );
    }

    function resetInfoFi() external payable onlyOwner {
        require(msg.value > 0, "Must send value");
        (bool ok, ) = payable(infoFi).call{value: msg.value}("");
        require(ok, "Payment failed");
        untrackedInfoFi = 0;
    }

    // ============ View ============

    function getMints() external view returns (uint256) {
        return mints;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) external pure returns (bool) {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IETHRegistrarController).interfaceId;
    }
}
