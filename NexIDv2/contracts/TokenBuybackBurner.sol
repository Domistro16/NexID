// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IUniswapV2Router02 {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external;
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

interface IVirtualsBonding {
    function buy(
        uint256 amountIn_,
        address tokenAddress_,
        uint256 amountOutMin_,
        uint256 deadline_
    ) external payable returns (bool);
}

contract TokenBuybackBurner is Ownable {
    using SafeERC20 for IERC20;

    enum SwapType {
        UniswapV2,
        UniswapV3Single,
        UniswapV3Path,
        VirtualsBonding
    }

    address public immutable collateral;
    address public targetToken;
    address public router;
    address public buybackSafe;
    address public authorizedFeeRouter;

    SwapType public swapType;
    uint24 public v3PoolFee = 3000; // Default 0.3%
    address[] public v2Path;
    bytes public v3Path;

    // Virtuals specific addresses
    address public virtualToken;
    address public bondingContract;
    address public virtualsBondingSpender;
    address public weth;
    uint24 public collateralWethPoolFee = 500; // Virtuals Base path: collateral/USDC -> WETH at 0.05%
    uint24 public wethVirtualPoolFee = 500; // Virtuals Base path: WETH -> VIRTUAL at 0.05%

    event BuybackAndBurn(uint256 amountIn, uint256 amountOut);
    event TargetTokenUpdated(address indexed targetToken);
    event RouterUpdated(address indexed router);
    event BuybackSafeUpdated(address indexed buybackSafe);
    event AuthorizedFeeRouterUpdated(address indexed authorizedFeeRouter);
    event SwapTypeUpdated(SwapType indexed swapType);
    event V2PathUpdated(address[] path);
    event V3PathUpdated(bytes path);
    event V3PoolFeeUpdated(uint24 fee);
    event VirtualTokenUpdated(address indexed virtualToken);
    event BondingContractUpdated(address indexed bondingContract);
    event VirtualsBondingSpenderUpdated(address indexed virtualsBondingSpender);
    event VirtualsSwapConfigUpdated(address indexed weth, uint24 collateralWethPoolFee, uint24 wethVirtualPoolFee);
    event BuybackFallbackRouted(address indexed token, uint256 amount, string reason);

    constructor(
        address admin,
        address collateral_,
        address targetToken_,
        address router_,
        address buybackSafe_,
        address authorizedFeeRouter_
    ) Ownable(admin) {
        require(collateral_ != address(0), "collateral required");
        require(buybackSafe_ != address(0), "buyback safe required");
        collateral = collateral_;
        targetToken = targetToken_;
        router = router_;
        buybackSafe = buybackSafe_;
        authorizedFeeRouter = authorizedFeeRouter_;
        swapType = SwapType.UniswapV2;

        v2Path = new address[](2);
        v2Path[0] = collateral_;
        v2Path[1] = targetToken_;
    }

    function setTargetToken(address targetToken_) external onlyOwner {
        targetToken = targetToken_;
        if (v2Path.length == 2) {
            v2Path[1] = targetToken_;
        }
        emit TargetTokenUpdated(targetToken_);
    }

    function setRouter(address router_) external onlyOwner {
        router = router_;
        emit RouterUpdated(router_);
    }

    function setBuybackSafe(address buybackSafe_) external onlyOwner {
        require(buybackSafe_ != address(0), "buyback safe required");
        buybackSafe = buybackSafe_;
        emit BuybackSafeUpdated(buybackSafe_);
    }

    function setAuthorizedFeeRouter(address authorizedFeeRouter_) external onlyOwner {
        require(authorizedFeeRouter_ != address(0), "fee router required");
        authorizedFeeRouter = authorizedFeeRouter_;
        emit AuthorizedFeeRouterUpdated(authorizedFeeRouter_);
    }

    function setSwapType(SwapType swapType_) external onlyOwner {
        swapType = swapType_;
        emit SwapTypeUpdated(swapType_);
    }

    function setV2Path(address[] calldata path_) external onlyOwner {
        require(path_.length >= 2, "invalid path length");
        require(path_[0] == collateral, "invalid start token");
        require(path_[path_.length - 1] == targetToken, "invalid end token");
        v2Path = path_;
        emit V2PathUpdated(path_);
    }

    function setV3Path(bytes calldata path_) external onlyOwner {
        v3Path = path_;
        emit V3PathUpdated(path_);
    }

    function setV3PoolFee(uint24 fee_) external onlyOwner {
        v3PoolFee = fee_;
        emit V3PoolFeeUpdated(fee_);
    }

    function setVirtualToken(address virtualToken_) external onlyOwner {
        virtualToken = virtualToken_;
        emit VirtualTokenUpdated(virtualToken_);
    }

    function setBondingContract(address bondingContract_) external onlyOwner {
        bondingContract = bondingContract_;
        emit BondingContractUpdated(bondingContract_);
    }

    function setVirtualsBondingSpender(address virtualsBondingSpender_) external onlyOwner {
        virtualsBondingSpender = virtualsBondingSpender_;
        emit VirtualsBondingSpenderUpdated(virtualsBondingSpender_);
    }

    function setVirtualsSwapConfig(
        address weth_,
        uint24 collateralWethPoolFee_,
        uint24 wethVirtualPoolFee_
    ) external onlyOwner {
        weth = weth_;
        collateralWethPoolFee = collateralWethPoolFee_;
        wethVirtualPoolFee = wethVirtualPoolFee_;
        emit VirtualsSwapConfigUpdated(weth_, collateralWethPoolFee_, wethVirtualPoolFee_);
    }

    function onFeeReceived(address token, uint256 amount) external {
        require(msg.sender == authorizedFeeRouter, "unauthorized fee router");
        if (amount == 0) {
            return;
        }
        require(token == collateral, "invalid token");
        if (targetToken == address(0)) {
            _routeFallback(collateral, amount, "TARGET_TOKEN_NOT_CONFIGURED");
            return;
        }

        if (swapType == SwapType.UniswapV2) {
            if (router == address(0)) {
                _routeFallback(collateral, amount, "ROUTER_NOT_CONFIGURED");
                return;
            }
            IERC20(collateral).forceApprove(router, amount);
            try IUniswapV2Router02(router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amount,
                0,
                v2Path,
                address(0x000000000000000000000000000000000000dEaD),
                block.timestamp + 300
            ) {
                emit BuybackAndBurn(amount, 0);
            } catch {
                _routeFallback(collateral, amount, "UNISWAP_V2_SWAP_FAILED");
            }
        } else if (swapType == SwapType.UniswapV3Single) {
            if (router == address(0)) {
                _routeFallback(collateral, amount, "ROUTER_NOT_CONFIGURED");
                return;
            }
            IERC20(collateral).forceApprove(router, amount);
            ISwapRouter02.ExactInputSingleParams memory params = ISwapRouter02.ExactInputSingleParams({
                tokenIn: collateral,
                tokenOut: targetToken,
                fee: v3PoolFee,
                recipient: address(0x000000000000000000000000000000000000dEaD),
                amountIn: amount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
            try ISwapRouter02(router).exactInputSingle(params) returns (uint256 amountOut) {
                emit BuybackAndBurn(amount, amountOut);
            } catch {
                _routeFallback(collateral, amount, "UNISWAP_V3_SINGLE_SWAP_FAILED");
            }
        } else if (swapType == SwapType.UniswapV3Path) {
            if (router == address(0)) {
                _routeFallback(collateral, amount, "ROUTER_NOT_CONFIGURED");
                return;
            }
            if (v3Path.length == 0) {
                _routeFallback(collateral, amount, "V3_PATH_NOT_CONFIGURED");
                return;
            }
            IERC20(collateral).forceApprove(router, amount);
            ISwapRouter02.ExactInputParams memory params = ISwapRouter02.ExactInputParams({
                path: v3Path,
                recipient: address(0x000000000000000000000000000000000000dEaD),
                amountIn: amount,
                amountOutMinimum: 0
            });
            try ISwapRouter02(router).exactInput(params) returns (uint256 amountOut) {
                emit BuybackAndBurn(amount, amountOut);
            } catch {
                _routeFallback(collateral, amount, "UNISWAP_V3_PATH_SWAP_FAILED");
            }
        } else if (swapType == SwapType.VirtualsBonding) {
            if (bondingContract == address(0)) {
                _routeFallback(collateral, amount, "BONDING_CONTRACT_NOT_CONFIGURED");
                return;
            }
            if (virtualToken == address(0)) {
                _routeFallback(collateral, amount, "VIRTUAL_TOKEN_NOT_CONFIGURED");
                return;
            }
            if (virtualsBondingSpender == address(0)) {
                _routeFallback(collateral, amount, "VIRTUALS_SPENDER_NOT_CONFIGURED");
                return;
            }

            uint256 virtualAmount = _toVirtualsBaseAsset(amount);
            if (virtualAmount == 0) return;

            // BondingV5 delegates transferFrom to FRouterV3, so approve the spender, not the proxy.
            IERC20(virtualToken).forceApprove(virtualsBondingSpender, virtualAmount);

            uint256 balanceBefore = IERC20(targetToken).balanceOf(address(this));

            // Purchase target token on the Virtuals bonding curve
            try IVirtualsBonding(bondingContract).buy(
                virtualAmount,
                targetToken,
                0,
                block.timestamp + 300
            ) returns (bool success) {
                if (success) {
                    uint256 balanceAfter = IERC20(targetToken).balanceOf(address(this));
                    uint256 tokensBought = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0;
                    if (tokensBought > 0) {
                        // Burn the bought tokens by sending them to the dead address
                        try IERC20(targetToken).transfer(address(0x000000000000000000000000000000000000dEaD), tokensBought) {} catch {
                            _routeFallback(targetToken, tokensBought, "TARGET_BURN_TRANSFER_FAILED");
                        }
                    }
                    emit BuybackAndBurn(amount, tokensBought);
                } else {
                    _routeFallback(virtualToken, virtualAmount, "VIRTUALS_BONDING_BUY_FALSE");
                }
            } catch {
                _routeFallback(virtualToken, virtualAmount, "VIRTUALS_BONDING_BUY_FAILED");
            }
        }
    }

    function _toVirtualsBaseAsset(uint256 amount) internal returns (uint256) {
        if (collateral == virtualToken) {
            return amount;
        }
        if (router == address(0)) {
            _routeFallback(collateral, amount, "ROUTER_NOT_CONFIGURED");
            return 0;
        }
        if (weth == address(0)) {
            _routeFallback(collateral, amount, "WETH_NOT_CONFIGURED");
            return 0;
        }

        uint256 wethAmount = amount;
        if (collateral != weth) {
            IERC20(collateral).forceApprove(router, amount);
            uint256 wethBefore = IERC20(weth).balanceOf(address(this));
            ISwapRouter02.ExactInputSingleParams memory legOne = ISwapRouter02.ExactInputSingleParams({
                tokenIn: collateral,
                tokenOut: weth,
                fee: collateralWethPoolFee,
                recipient: address(this),
                amountIn: amount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
            try ISwapRouter02(router).exactInputSingle(legOne) returns (uint256) {
                uint256 wethAfter = IERC20(weth).balanceOf(address(this));
                wethAmount = wethAfter > wethBefore ? wethAfter - wethBefore : 0;
            } catch {
                _routeFallback(collateral, amount, "COLLATERAL_TO_WETH_SWAP_FAILED");
                return 0;
            }
        }

        if (wethAmount == 0) {
            return 0;
        }
        if (weth == virtualToken) {
            return wethAmount;
        }

        IERC20(weth).forceApprove(router, wethAmount);
        uint256 virtualBefore = IERC20(virtualToken).balanceOf(address(this));
        ISwapRouter02.ExactInputSingleParams memory legTwo = ISwapRouter02.ExactInputSingleParams({
            tokenIn: weth,
            tokenOut: virtualToken,
            fee: wethVirtualPoolFee,
            recipient: address(this),
            amountIn: wethAmount,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        try ISwapRouter02(router).exactInputSingle(legTwo) returns (uint256) {
            uint256 virtualAfter = IERC20(virtualToken).balanceOf(address(this));
            return virtualAfter > virtualBefore ? virtualAfter - virtualBefore : 0;
        } catch {
            _routeFallback(weth, wethAmount, "WETH_TO_VIRTUAL_SWAP_FAILED");
            return 0;
        }
    }

    function _routeFallback(address token, uint256 amount, string memory reason) internal {
        if (amount == 0) return;
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 transferAmount = amount <= balance ? amount : balance;
        if (transferAmount == 0) return;
        IERC20(token).safeTransfer(buybackSafe, transferAmount);
        emit BuybackFallbackRouted(token, transferAmount, reason);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "recipient required");
        IERC20(token).safeTransfer(to, amount);
    }
}
