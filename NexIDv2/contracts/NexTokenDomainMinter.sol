// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentRegistrarControllerOwner {
    struct RegisterRequest {
        string name;
        address owner;
        bytes32 secret;
        address resolver;
        bytes[] data;
        bool reverseRecord;
        uint16 ownerControlledFuses;
        bool deployWallet;
        uint256 walletSalt;
    }

    function owner() external view returns (address);
    function transferOwnership(address newOwner) external;
    function available(string calldata name) external view returns (bool);
    function reservedOwners(bytes32 label) external view returns (address);
    function reserveNamesBatch(string[] calldata names, address[] calldata owners) external;
    function mintReserved(RegisterRequest calldata req) external;
}

interface INexDomainsReferralVerifier {
    struct ReferralData {
        address referrer;
        address registrant;
        bytes32 nameHash;
        bytes32 referrerCodeHash;
        uint256 deadline;
        bytes32 nonce;
    }

    function processReferral(
        ReferralData calldata data,
        bytes calldata signature,
        uint256 totalPrice,
        address token,
        bool isFiat
    ) external payable returns (uint256 paidAmount);
}

interface INexDomainsReverseRegistrar {
    function setNameForAddr(
        address addr,
        address owner,
        address resolver,
        string calldata name
    ) external returns (bytes32);
}

contract NexTokenDomainMinter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_REFERRAL_PCT = 30;
    address public constant DEFAULT_BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    IERC20 public immutable paymentToken;
    IAgentRegistrarControllerOwner public agentRegistrar;
    INexDomainsReferralVerifier public referralVerifier;
    INexDomainsReverseRegistrar public reverseRegistrar;

    address public publicResolver;
    address public burnAddress;
    uint256 public mintPrice;
    bool public mintingEnabled = true;

    struct DomainMintRequest {
        string name;
        address owner;
        bytes[] resolverData;
        bool reverseRecord;
        uint16 ownerControlledFuses;
        bool deployWallet;
        uint256 walletSalt;
    }

    event TokenDomainMinted(
        string name,
        address indexed owner,
        address indexed payer,
        uint256 paymentAmount,
        uint256 referralPaid,
        uint256 burnedAmount,
        bool reverseRecord
    );
    event MintPriceUpdated(uint256 mintPrice);
    event BurnAddressUpdated(address indexed burnAddress);
    event MintingEnabledUpdated(bool enabled);
    event AgentRegistrarUpdated(address indexed agentRegistrar);
    event ReferralVerifierUpdated(address indexed referralVerifier);
    event ReverseRegistrarUpdated(address indexed reverseRegistrar);
    event PublicResolverUpdated(address indexed publicResolver);
    event AgentRegistrarOwnershipTransferred(address indexed newOwner);
    event PaymentTokenBurned(uint256 amount);
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    constructor(
        address admin,
        address paymentToken_,
        address agentRegistrar_,
        address referralVerifier_,
        address reverseRegistrar_,
        address publicResolver_,
        address burnAddress_,
        uint256 mintPrice_
    ) Ownable(admin) {
        require(paymentToken_ != address(0), "payment token required");
        require(agentRegistrar_ != address(0), "agent registrar required");
        require(publicResolver_ != address(0), "resolver required");
        paymentToken = IERC20(paymentToken_);
        agentRegistrar = IAgentRegistrarControllerOwner(agentRegistrar_);
        referralVerifier = INexDomainsReferralVerifier(referralVerifier_);
        reverseRegistrar = INexDomainsReverseRegistrar(reverseRegistrar_);
        publicResolver = publicResolver_;
        burnAddress = burnAddress_ == address(0) ? DEFAULT_BURN_ADDRESS : burnAddress_;
        mintPrice = mintPrice_;
    }

    function setMintPrice(uint256 mintPrice_) external onlyOwner {
        mintPrice = mintPrice_;
        emit MintPriceUpdated(mintPrice_);
    }

    function setBurnAddress(address burnAddress_) external onlyOwner {
        require(burnAddress_ != address(0), "burn address required");
        burnAddress = burnAddress_;
        emit BurnAddressUpdated(burnAddress_);
    }

    function setMintingEnabled(bool enabled) external onlyOwner {
        mintingEnabled = enabled;
        emit MintingEnabledUpdated(enabled);
    }

    function setAgentRegistrar(address agentRegistrar_) external onlyOwner {
        require(agentRegistrar_ != address(0), "agent registrar required");
        agentRegistrar = IAgentRegistrarControllerOwner(agentRegistrar_);
        emit AgentRegistrarUpdated(agentRegistrar_);
    }

    function setReferralVerifier(address referralVerifier_) external onlyOwner {
        referralVerifier = INexDomainsReferralVerifier(referralVerifier_);
        emit ReferralVerifierUpdated(referralVerifier_);
    }

    function setReverseRegistrar(address reverseRegistrar_) external onlyOwner {
        reverseRegistrar = INexDomainsReverseRegistrar(reverseRegistrar_);
        emit ReverseRegistrarUpdated(reverseRegistrar_);
    }

    function setPublicResolver(address publicResolver_) external onlyOwner {
        require(publicResolver_ != address(0), "resolver required");
        publicResolver = publicResolver_;
        emit PublicResolverUpdated(publicResolver_);
    }

    function transferAgentRegistrarOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "new owner required");
        agentRegistrar.transferOwnership(newOwner);
        emit AgentRegistrarOwnershipTransferred(newOwner);
    }

    function mintWithToken(
        DomainMintRequest calldata request,
        INexDomainsReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature
    ) external nonReentrant returns (uint256 referralPaid, uint256 burnedAmount) {
        uint256 price = mintPrice;
        _preflightAndCollect(request, price);
        _reserveAndMint(request);
        _setReverseIfRequested(request);

        referralPaid = _processReferral(request.name, request.owner, referralData, referralSignature, price);
        burnedAmount = price - referralPaid;
        paymentToken.safeTransfer(burnAddress, burnedAmount);

        _emitMinted(request, msg.sender, price, referralPaid, burnedAmount);
    }

    function burnPaymentTokenBalance(uint256 amount) external onlyOwner {
        paymentToken.safeTransfer(burnAddress, amount);
        emit PaymentTokenBurned(amount);
    }

    function recoverToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(paymentToken), "use burnPaymentTokenBalance");
        require(to != address(0), "recipient required");
        IERC20(token).safeTransfer(to, amount);
        emit TokenRecovered(token, to, amount);
    }

    function _processReferral(
        string calldata name,
        address domainOwner,
        INexDomainsReferralVerifier.ReferralData calldata referralData,
        bytes calldata referralSignature,
        uint256 price
    ) internal returns (uint256 referralPaid) {
        if (referralData.referrer == address(0) && referralSignature.length == 0) {
            return 0;
        }
        require(address(referralVerifier) != address(0), "referral verifier required");
        require(referralData.referrer != address(0), "referrer required");
        require(referralSignature.length > 0, "referral signature required");
        require(referralData.registrant == domainOwner, "referral registrant mismatch");
        require(referralData.nameHash == keccak256(bytes(name)), "referral name mismatch");

        uint256 maxReferralAmount = (price * MAX_REFERRAL_PCT) / 100;
        paymentToken.safeTransfer(address(referralVerifier), maxReferralAmount);
        referralPaid = referralVerifier.processReferral(
            referralData,
            referralSignature,
            price,
            address(paymentToken),
            false
        );
        require(referralPaid <= maxReferralAmount, "referral overflow");
    }

    function _preflightAndCollect(DomainMintRequest calldata request, uint256 price) internal {
        require(mintingEnabled, "minting disabled");
        require(request.owner != address(0), "domain owner required");
        require(price > 0, "mint price required");
        require(_validLabel(request.name), "invalid name");
        require(agentRegistrar.owner() == address(this), "minter is not controller owner");
        require(agentRegistrar.available(request.name), "name unavailable");

        bytes32 label = keccak256(bytes(request.name));
        address reservedOwner = agentRegistrar.reservedOwners(label);
        require(reservedOwner == address(0) || reservedOwner == request.owner, "reserved for another owner");

        uint256 balanceBefore = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(msg.sender, address(this), price);
        require(paymentToken.balanceOf(address(this)) >= balanceBefore + price, "payment short");
    }

    function _reserveAndMint(DomainMintRequest calldata request) internal {
        bytes32 label = keccak256(bytes(request.name));
        if (agentRegistrar.reservedOwners(label) == address(0)) {
            string[] memory names = new string[](1);
            address[] memory owners = new address[](1);
            names[0] = request.name;
            owners[0] = request.owner;
            agentRegistrar.reserveNamesBatch(names, owners);
        }

        IAgentRegistrarControllerOwner.RegisterRequest memory req = IAgentRegistrarControllerOwner.RegisterRequest({
            name: request.name,
            owner: request.owner,
            secret: bytes32(0),
            resolver: publicResolver,
            data: request.resolverData,
            reverseRecord: false,
            ownerControlledFuses: request.ownerControlledFuses,
            deployWallet: request.deployWallet,
            walletSalt: request.walletSalt
        });
        agentRegistrar.mintReserved(req);
    }

    function _setReverseIfRequested(DomainMintRequest calldata request) internal {
        if (!request.reverseRecord) {
            return;
        }
        require(address(reverseRegistrar) != address(0), "reverse registrar required");
        reverseRegistrar.setNameForAddr(request.owner, request.owner, publicResolver, string.concat(request.name, ".id"));
    }

    function _emitMinted(
        DomainMintRequest calldata request,
        address payer,
        uint256 price,
        uint256 referralPaid,
        uint256 burnedAmount
    ) internal {
        emit TokenDomainMinted(request.name, request.owner, payer, price, referralPaid, burnedAmount, request.reverseRecord);
    }

    function _validLabel(string calldata name) internal pure returns (bool) {
        bytes memory raw = bytes(name);
        if (raw.length == 0 || raw.length > 63) {
            return false;
        }
        if (raw[0] == bytes1("-") || raw[raw.length - 1] == bytes1("-")) {
            return false;
        }
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 char = raw[i];
            bool lower = char >= 0x61 && char <= 0x7a;
            bool digit = char >= 0x30 && char <= 0x39;
            bool hyphen = char == bytes1("-");
            if (!lower && !digit && !hyphen) {
                return false;
            }
        }
        return true;
    }
}
