// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INativeMarketCloseSignals {
    function closingSpotPrice() external view returns (uint256);
    function closingTWAP() external view returns (uint256);
    function closingTWAPWindowSeconds() external view returns (uint256);
}

contract MockProofFlowResolutionReader {
    function readCloseSignals(address market) external view returns (
        uint256 spotPrice,
        uint256 twap,
        uint256 windowSeconds
    ) {
        INativeMarketCloseSignals nativeMarket = INativeMarketCloseSignals(market);
        return (
            nativeMarket.closingSpotPrice(),
            nativeMarket.closingTWAP(),
            nativeMarket.closingTWAPWindowSeconds()
        );
    }
}
