// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IMintableToken {
    function mint(address to, uint256 amount) external;
}

contract MockVirtualsBonding {
    using SafeERC20 for IERC20;

    address public immutable virtualToken;
    address public immutable agentToken;

    event BondingBuy(uint256 amountIn, address indexed tokenAddress, uint256 amountOutMin, uint256 deadline);

    constructor(address virtualToken_, address agentToken_) {
        virtualToken = virtualToken_;
        agentToken = agentToken_;
    }

    function buy(
        uint256 amountIn_,
        address tokenAddress_,
        uint256 amountOutMin_,
        uint256 deadline_
    ) external payable returns (bool) {
        require(tokenAddress_ == agentToken, "invalid agent token");
        IERC20(virtualToken).safeTransferFrom(msg.sender, address(this), amountIn_);

        // Mint some agent tokens to the caller (TokenBuybackBurner)
        IMintableToken(agentToken).mint(msg.sender, amountIn_ * 2);

        emit BondingBuy(amountIn_, tokenAddress_, amountOutMin_, deadline_);
        return true;
    }
}
