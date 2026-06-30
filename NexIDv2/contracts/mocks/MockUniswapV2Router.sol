// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockUniswapV2Router {
    using SafeERC20 for IERC20;

    event SwapExecuted(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline);

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external {
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        emit SwapExecuted(amountIn, amountOutMin, path, to, deadline);
    }
}

contract MockFailingUniswapV2Router {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint,
        uint,
        address[] calldata,
        address,
        uint
    ) external pure {
        revert("mock v2 swap failed");
    }
}
