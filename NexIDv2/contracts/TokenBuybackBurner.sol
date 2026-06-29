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

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
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

    SwapType public swapType;
    uint24 public v3PoolFee = 3000; // Default 0.3%
    address[] public v2Path;
    bytes public v3Path;

    // Virtuals specific addresses
    address public virtualToken;
    address public bondingContract;

    event BuybackAndBurn(uint256 amountIn, uint256 amountOut);
    event TargetTokenUpdated(address indexed targetToken);
    event RouterUpdated(address indexed router);
    event SwapTypeUpdated(SwapType indexed swapType);
    event V2PathUpdated(address[] path);
    event V3PathUpdated(bytes path);
    event V3PoolFeeUpdated(uint24 fee);
    event VirtualTokenUpdated(address indexed virtualToken);
    event BondingContractUpdated(address indexed bondingContract);

    constructor(
        address admin,
        address collateral_,
        address targetToken_,
        address router_
    ) Ownable(admin) {
        require(collateral_ != address(0), "collateral required");
        collateral = collateral_;
        targetToken = targetToken_;
        router = router_;
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

    function onFeeReceived(address token, uint256 amount) external {
        if (amount == 0 || targetToken == address(0)) {
            return;
        }
        require(token == collateral, "invalid token");

        if (swapType == SwapType.UniswapV2) {
            if (router == address(0)) return;
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
                // Keep collateral on failure
            }
        } else if (swapType == SwapType.UniswapV3Single) {
            if (router == address(0)) return;
            IERC20(collateral).forceApprove(router, amount);
            ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
                tokenIn: collateral,
                tokenOut: targetToken,
                fee: v3PoolFee,
                recipient: address(0x000000000000000000000000000000000000dEaD),
                deadline: block.timestamp + 300,
                amountIn: amount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
            try ISwapRouter(router).exactInputSingle(params) returns (uint256 amountOut) {
                emit BuybackAndBurn(amount, amountOut);
            } catch {
                // Keep collateral on failure
            }
        } else if (swapType == SwapType.UniswapV3Path) {
            if (router == address(0)) return;
            require(v3Path.length > 0, "v3 path required");
            IERC20(collateral).forceApprove(router, amount);
            ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
                path: v3Path,
                recipient: address(0x000000000000000000000000000000000000dEaD),
                deadline: block.timestamp + 300,
                amountIn: amount,
                amountOutMinimum: 0
            });
            try ISwapRouter(router).exactInput(params) returns (uint256 amountOut) {
                emit BuybackAndBurn(amount, amountOut);
            } catch {
                // Keep collateral on failure
            }
        } else if (swapType == SwapType.VirtualsBonding) {
            require(bondingContract != address(0), "bonding contract required");

            uint256 virtualAmount = amount;
            if (collateral != virtualToken) {
                if (router == address(0)) return;
                require(virtualToken != address(0), "virtual token required");

                // Swap collateral -> virtualToken using Uniswap V3 Single
                IERC20(collateral).forceApprove(router, amount);
                ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
                    tokenIn: collateral,
                    tokenOut: virtualToken,
                    fee: v3PoolFee,
                    recipient: address(this),
                    deadline: block.timestamp + 300,
                    amountIn: amount,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                });
                try ISwapRouter(router).exactInputSingle(params) returns (uint256 amountOut) {
                    virtualAmount = amountOut;
                } catch {
                    return; // Keep collateral on failure
                }
            }

            // Approve bonding contract to spend the VIRTUAL token
            IERC20(virtualToken).forceApprove(bondingContract, virtualAmount);

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
                        try IERC20(targetToken).transfer(address(0x000000000000000000000000000000000000dEaD), tokensBought) {} catch {}
                    }
                    emit BuybackAndBurn(amount, tokensBought);
                }
            } catch {
                // Keep virtualToken / collateral on failure
            }
        }
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "recipient required");
        IERC20(token).safeTransfer(to, amount);
    }
}
