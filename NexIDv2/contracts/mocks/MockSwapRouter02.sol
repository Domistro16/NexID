// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
}

contract MockSwapRouter02 {
    using SafeERC20 for IERC20;

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    event ExactInputSingleSwap(
        address indexed tokenIn,
        address indexed tokenOut,
        uint24 fee,
        address indexed recipient,
        uint256 amountIn,
        uint256 amountOut
    );

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        amountOut = params.amountIn;
        require(amountOut >= params.amountOutMinimum, "too little received");
        IMintableERC20(params.tokenOut).mint(params.recipient, amountOut);
        emit ExactInputSingleSwap(params.tokenIn, params.tokenOut, params.fee, params.recipient, params.amountIn, amountOut);
    }
}

contract MockSelectiveSwapRouter02 {
    using SafeERC20 for IERC20;

    address public immutable tokenOutToFail;

    constructor(address tokenOutToFail_) {
        tokenOutToFail = tokenOutToFail_;
    }

    function exactInputSingle(MockSwapRouter02.ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        if (params.tokenOut == tokenOutToFail) {
            revert("mock swap failed");
        }
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        amountOut = params.amountIn;
        require(amountOut >= params.amountOutMinimum, "too little received");
        IMintableERC20(params.tokenOut).mint(params.recipient, amountOut);
    }
}
