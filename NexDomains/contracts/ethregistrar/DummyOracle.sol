// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

contract DummyOracle {
    int256 value;

    constructor(int256 _value) {
        set(_value);
    }

    function set(int256 _value) public {
        value = _value;
    }

    function latestAnswer() public view returns (int256) {
        return value;
    }

    // Chainlink AggregatorV3Interface compatible function
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, value, block.timestamp, block.timestamp, 1);
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }
}
