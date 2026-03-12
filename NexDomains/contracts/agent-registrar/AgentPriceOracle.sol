// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IAgentPriceOracle} from "./interfaces/IAgentPriceOracle.sol";
import {StringUtils} from "../utils/StringUtils.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {
    AggregatorV3Interface
} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title AgentPriceOracle
 * @notice Price oracle with agent-aware pricing for SafuDomains v2
 * @dev Implements pattern matching for agent name detection and tiered pricing
 *
 * Agent names (≥10 chars + pattern match) get $0.01-$0.10 pricing
 * Standard names get length-based pricing from $2 to $2,000
 */
contract AgentPriceOracle is IAgentPriceOracle, Ownable, IERC165 {
    using StringUtils for string;

    // ============ Constants ============

    /// @notice Minimum length for agent name eligibility
    uint256 public constant AGENT_MIN_LENGTH = 10;

    /// @notice Base agent price: $0.10 (in 18 decimals)
    uint256 public constant AGENT_BASE_PRICE = 100000000000000000; // 0.10 * 1e18

    /// @notice Minimum agent price: $0.01 (in 18 decimals)
    uint256 public constant AGENT_MIN_PRICE = 10000000000000000; // 0.01 * 1e18

    /// @notice Length bonus per char over 10: $0.001 (max $0.02)
    uint256 public constant LENGTH_BONUS_PER_CHAR = 1000000000000000; // 0.001 * 1e18
    uint256 public constant MAX_LENGTH_BONUS = 20000000000000000; // 0.02 * 1e18

    /// @notice Entropy bonus for UUID-like names: $0.01
    uint256 public constant ENTROPY_BONUS = 10000000000000000; // 0.01 * 1e18

    /// @notice Multi-pattern bonus if 2+ categories match: $0.01
    uint256 public constant MULTI_PATTERN_BONUS = 10000000000000000; // 0.01 * 1e18

    /// @notice Entropy threshold: 80% hex characters
    uint256 public constant ENTROPY_THRESHOLD = 80;

    // ============ Standard Pricing (18 decimals USD) ============

    uint256 public constant PRICE_1_CHAR = 2000 * 1e18; // $2,000
    uint256 public constant PRICE_2_CHAR = 1000 * 1e18; // $1,000
    uint256 public constant PRICE_3_CHAR = 200 * 1e18; // $200
    uint256 public constant PRICE_4_CHAR = 40 * 1e18; // $40
    uint256 public constant PRICE_5_CHAR = 10 * 1e18; // $10
    uint256 public constant PRICE_6_9_CHAR = 5 * 1e18; // $5
    uint256 public constant PRICE_10_PLUS = 2 * 1e18; // $2

    // ============ State Variables ============

    AggregatorV3Interface public immutable ethUsdOracle;

    // ============ Constructor ============

    constructor(AggregatorV3Interface _ethUsdOracle) {
        ethUsdOracle = _ethUsdOracle;
    }

    // ============ External View Functions ============

    /**
     * @inheritdoc IAgentPriceOracle
     */
    function getPrice(
        string calldata name
    ) external view override returns (AgentPrice memory) {
        bool _isAgent = _isAgentName(name);
        uint256 priceUsd;

        if (_isAgent) {
            priceUsd = _calculateAgentPrice(name);
        } else {
            priceUsd = _calculateStandardPrice(name);
        }

        uint256 priceWei = _usdToWei(priceUsd);

        return
            AgentPrice({
                priceWei: priceWei,
                priceUsd: priceUsd,
                isAgentName: _isAgent
            });
    }

    /**
     * @inheritdoc IAgentPriceOracle
     */
    function isAgentName(
        string calldata name
    ) external view override returns (bool) {
        return _isAgentName(name);
    }

    /**
     * @inheritdoc IAgentPriceOracle
     */
    function getPatternMatchCount(
        string calldata name
    ) external pure override returns (uint256) {
        return _countPatternMatches(name);
    }

    // ============ IERC165 ============

    function supportsInterface(
        bytes4 interfaceID
    ) public pure override returns (bool) {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IAgentPriceOracle).interfaceId;
    }

    // ============ Internal: Agent Name Detection ============

    /**
     * @notice Check if a name qualifies as an agent name
     * @dev Must meet all criteria:
     *      1. Length ≥ 10 characters
     *      2. Matches at least one pattern category
     *      3. Does not start with disqualifying words
     */
    function _isAgentName(string calldata name) internal pure returns (bool) {
        uint256 len = bytes(name).length;

        // Rule 1: Minimum length
        if (len < AGENT_MIN_LENGTH) {
            return false;
        }

        // Rule 3: Check for disqualifying words first (cheaper check)
        if (_hasDisqualifyingWord(name)) {
            return false;
        }

        // Rule 2: Must match at least one pattern
        return _countPatternMatches(name) > 0;
    }

    /**
     * @notice Count how many pattern categories the name matches
     */
    function _countPatternMatches(
        string calldata name
    ) internal pure returns (uint256) {
        uint256 count = 0;

        if (_matchesSuffixPattern(name)) count++;
        if (_matchesVersionPattern(name)) count++;
        if (_matchesUUIDPattern(name)) count++;
        if (_matchesPrefixPattern(name)) count++;
        if (_matchesFunctionalPattern(name)) count++;

        return count;
    }

    /**
     * @notice Category A: Suffix patterns
     * @dev Matches: -agent, -bot, -ai, -llm, -gpt, -model, -tutor, -edu, -credential, -synthesia, -donna
     */
    function _matchesSuffixPattern(
        string calldata name
    ) internal pure returns (bool) {
        bytes memory b = bytes(name);
        uint256 len = b.length;

        // Check for -agent (6 chars)
        if (len >= 6 && _endsWithIgnoreCase(b, "-agent")) return true;

        // Check for -bot (4 chars)
        if (len >= 4 && _endsWithIgnoreCase(b, "-bot")) return true;

        // Check for -ai (3 chars)
        if (len >= 3 && _endsWithIgnoreCase(b, "-ai")) return true;

        // Check for -llm (4 chars)
        if (len >= 4 && _endsWithIgnoreCase(b, "-llm")) return true;

        // Check for -gpt (4 chars)
        if (len >= 4 && _endsWithIgnoreCase(b, "-gpt")) return true;

        // Check for -model (6 chars)
        if (len >= 6 && _endsWithIgnoreCase(b, "-model")) return true;

        // Check for -tutor (6 chars)
        if (len >= 6 && _endsWithIgnoreCase(b, "-tutor")) return true;

        // Check for -edu (4 chars)
        if (len >= 4 && _endsWithIgnoreCase(b, "-edu")) return true;

        // Check for -credential (11 chars)
        if (len >= 11 && _endsWithIgnoreCase(b, "-credential")) return true;

        // Check for -synthesia (10 chars)
        if (len >= 10 && _endsWithIgnoreCase(b, "-synthesia")) return true;

        // Check for -donna (6 chars)
        if (len >= 6 && _endsWithIgnoreCase(b, "-donna")) return true;

        return false;
    }

    /**
     * @notice Category B: Version/Timestamp patterns
     * @dev Matches: -v1, -v42, -version3, -YYYY-MM-DD, -epoch123, 8-14 digit timestamps
     */
    function _matchesVersionPattern(
        string calldata name
    ) internal pure returns (bool) {
        bytes memory b = bytes(name);
        uint256 len = b.length;

        if (len < 3) return false;

        // Look for -v followed by digits at the end
        // Or -version followed by digits
        // Or date patterns

        // Scan from the end to find the last hyphen
        uint256 lastHyphen = len;
        for (uint256 i = len; i > 0; i--) {
            if (b[i - 1] == 0x2D) {
                // '-'
                lastHyphen = i - 1;
                break;
            }
        }

        if (lastHyphen == len || lastHyphen == len - 1) return false;

        uint256 suffixStart = lastHyphen + 1;
        uint256 suffixLen = len - suffixStart;

        // Check for -v followed by digits
        if (suffixLen >= 2) {
            bytes1 firstChar = _toLower(b[suffixStart]);
            if (firstChar == 0x76) {
                // 'v'
                // Check if rest are digits
                bool allDigits = true;
                for (uint256 i = suffixStart + 1; i < len; i++) {
                    if (!_isDigit(b[i])) {
                        allDigits = false;
                        break;
                    }
                }
                if (allDigits && suffixLen >= 2) return true;
            }
        }

        // Check for -version followed by digits
        if (
            suffixLen >= 8 && _startsWithAtIgnoreCase(b, suffixStart, "version")
        ) {
            bool allDigits = true;
            for (uint256 i = suffixStart + 7; i < len; i++) {
                if (!_isDigit(b[i])) {
                    allDigits = false;
                    break;
                }
            }
            if (allDigits) return true;
        }

        // Check for -epoch followed by digits
        if (
            suffixLen >= 6 && _startsWithAtIgnoreCase(b, suffixStart, "epoch")
        ) {
            bool allDigits = true;
            for (uint256 i = suffixStart + 5; i < len; i++) {
                if (!_isDigit(b[i])) {
                    allDigits = false;
                    break;
                }
            }
            if (allDigits) return true;
        }

        // Check for pure timestamp (8-14 digits at end)
        if (suffixLen >= 8 && suffixLen <= 14) {
            bool allDigits = true;
            for (uint256 i = suffixStart; i < len; i++) {
                if (!_isDigit(b[i])) {
                    allDigits = false;
                    break;
                }
            }
            if (allDigits) return true;
        }

        // Check for date format YYYY-MM-DD (10 chars after last non-date hyphen)
        if (len >= 10) {
            // Check if ends with YYYY-MM-DD pattern
            uint256 dateStart = len - 10;
            if (dateStart > 0 && b[dateStart - 1] == 0x2D) {
                // preceded by hyphen
                if (_isDatePattern(b, dateStart)) return true;
            }
        }

        return false;
    }

    /**
     * @notice Category C: UUID/Randomized patterns
     * @dev Matches UUID v4 format or 32-64 hex chars with ≥80% hex entropy
     */
    function _matchesUUIDPattern(
        string calldata name
    ) internal pure returns (bool) {
        bytes memory b = bytes(name);
        uint256 len = b.length;

        // Look for UUID pattern at the end: 8-4-4-4-12 (36 chars including hyphens)
        if (len >= 36) {
            uint256 uuidStart = len - 36;
            if (_isUUIDFormat(b, uuidStart)) return true;
        }

        // Check for 32-64 hex chars at end with entropy check
        if (len >= 32) {
            // Find the last hyphen before potential hex string
            uint256 hexStart = len;
            for (uint256 i = len; i > 0; i--) {
                if (b[i - 1] == 0x2D) {
                    // '-'
                    hexStart = i;
                    break;
                }
            }

            uint256 hexLen = len - hexStart;
            if (hexLen >= 32 && hexLen <= 64) {
                bool allHex = true;
                for (uint256 i = hexStart; i < len; i++) {
                    if (!_isHexChar(b[i])) {
                        allHex = false;
                        break;
                    }
                }
                if (allHex) {
                    // Check entropy
                    uint256 entropy = _calculateEntropy(b);
                    if (entropy >= ENTROPY_THRESHOLD) return true;
                }
            }
        }

        return false;
    }

    /**
     * @notice Category D: Prefix patterns
     * @dev Matches: agent-, bot-, ai-, llm-, gpt-, edu-, task-, swarm-, id-agent-, donna-, sys-, fleet-
     */
    function _matchesPrefixPattern(
        string calldata name
    ) internal pure returns (bool) {
        bytes memory b = bytes(name);
        uint256 len = b.length;

        // Check each prefix
        if (_startsWithIgnoreCase(b, "agent-")) return true;
        if (_startsWithIgnoreCase(b, "bot-")) return true;
        if (_startsWithIgnoreCase(b, "ai-")) return true;
        if (_startsWithIgnoreCase(b, "llm-")) return true;
        if (_startsWithIgnoreCase(b, "gpt-")) return true;
        if (_startsWithIgnoreCase(b, "edu-")) return true;
        if (_startsWithIgnoreCase(b, "task-")) return true;
        if (_startsWithIgnoreCase(b, "swarm-")) return true;
        if (_startsWithIgnoreCase(b, "id-agent-")) return true;
        if (_startsWithIgnoreCase(b, "donna-")) return true;
        if (_startsWithIgnoreCase(b, "sys-")) return true;
        if (_startsWithIgnoreCase(b, "fleet-")) return true;

        return false;
    }

    /**
     * @notice Category E: Functional descriptor patterns
     * @dev Matches names containing: -task-, -analyzer-, -issuer-, -generator-, -synthesizer-,
     *      -clone-, -fork-, -academy-, -pad-, -course-, -learn-, -teach-, -id-, -verse-
     */
    function _matchesFunctionalPattern(
        string calldata name
    ) internal pure returns (bool) {
        bytes memory b = bytes(name);

        // Check for each functional pattern
        if (_containsIgnoreCase(b, "-task-")) return true;
        if (_containsIgnoreCase(b, "-analyzer-")) return true;
        if (_containsIgnoreCase(b, "-issuer-")) return true;
        if (_containsIgnoreCase(b, "-generator-")) return true;
        if (_containsIgnoreCase(b, "-synthesizer-")) return true;
        if (_containsIgnoreCase(b, "-clone-")) return true;
        if (_containsIgnoreCase(b, "-fork-")) return true;
        if (_containsIgnoreCase(b, "-academy-")) return true;
        if (_containsIgnoreCase(b, "-pad-")) return true;
        if (_containsIgnoreCase(b, "-course-")) return true;
        if (_containsIgnoreCase(b, "-learn-")) return true;
        if (_containsIgnoreCase(b, "-teach-")) return true;
        if (_containsIgnoreCase(b, "-id-")) return true;
        if (_containsIgnoreCase(b, "-verse-")) return true;

        return false;
    }

    /**
     * @notice Check for disqualifying vanity words at the start
     * @dev Rejects: best, pro, cool, elite, prime, vip, king, queen, legend, god,
     *      master, ninja, wizard, crypto, defi, nft, moon, diamond, alpha, sigma, chad
     */
    function _hasDisqualifyingWord(
        string calldata name
    ) internal pure returns (bool) {
        bytes memory b = bytes(name);

        // Check each disqualifying prefix
        if (_startsWithIgnoreCase(b, "best")) return true;
        if (_startsWithIgnoreCase(b, "pro")) return true;
        if (_startsWithIgnoreCase(b, "cool")) return true;
        if (_startsWithIgnoreCase(b, "elite")) return true;
        if (_startsWithIgnoreCase(b, "prime")) return true;
        if (_startsWithIgnoreCase(b, "vip")) return true;
        if (_startsWithIgnoreCase(b, "king")) return true;
        if (_startsWithIgnoreCase(b, "queen")) return true;
        if (_startsWithIgnoreCase(b, "legend")) return true;
        if (_startsWithIgnoreCase(b, "god")) return true;
        if (_startsWithIgnoreCase(b, "master")) return true;
        if (_startsWithIgnoreCase(b, "ninja")) return true;
        if (_startsWithIgnoreCase(b, "wizard")) return true;
        if (_startsWithIgnoreCase(b, "crypto")) return true;
        if (_startsWithIgnoreCase(b, "defi")) return true;
        if (_startsWithIgnoreCase(b, "nft")) return true;
        if (_startsWithIgnoreCase(b, "moon")) return true;
        if (_startsWithIgnoreCase(b, "diamond")) return true;
        if (_startsWithIgnoreCase(b, "alpha")) return true;
        if (_startsWithIgnoreCase(b, "sigma")) return true;
        if (_startsWithIgnoreCase(b, "chad")) return true;

        return false;
    }

    // ============ Internal: Pricing Calculation ============

    /**
     * @notice Calculate standard pricing based on name length
     */
    function _calculateStandardPrice(
        string calldata name
    ) internal pure returns (uint256) {
        uint256 len = bytes(name).length;

        if (len == 1) return PRICE_1_CHAR;
        if (len == 2) return PRICE_2_CHAR;
        if (len == 3) return PRICE_3_CHAR;
        if (len == 4) return PRICE_4_CHAR;
        if (len == 5) return PRICE_5_CHAR;

        // 6-9 chars: flat $5
        if (len >= 6 && len <= 9) {
            return PRICE_6_9_CHAR;
        }

        // 10+ chars = $2
        return PRICE_10_PLUS;
    }

    /**
     * @notice Calculate agent pricing based on bonuses
     * @dev Base: $0.05, bonuses reduce price to minimum $0.01
     */
    function _calculateAgentPrice(
        string calldata name
    ) internal pure returns (uint256) {
        bytes memory b = bytes(name);
        uint256 len = b.length;

        uint256 price = AGENT_BASE_PRICE; // Start at $0.05

        // Length bonus: -$0.001 per char over 14, max -$0.02
        if (len > AGENT_MIN_LENGTH) {
            uint256 extraChars = len - AGENT_MIN_LENGTH;
            uint256 lengthBonus = extraChars * LENGTH_BONUS_PER_CHAR;
            if (lengthBonus > MAX_LENGTH_BONUS) {
                lengthBonus = MAX_LENGTH_BONUS;
            }
            if (price > lengthBonus) {
                price -= lengthBonus;
            }
        }

        // Entropy bonus: -$0.01 if >80% hex chars
        uint256 entropy = _calculateEntropy(b);
        if (entropy >= ENTROPY_THRESHOLD) {
            if (price > ENTROPY_BONUS) {
                price -= ENTROPY_BONUS;
            }
        }

        // Multi-pattern bonus: -$0.01 if 2+ categories match
        uint256 patternCount = _countPatternMatches(name);
        if (patternCount >= 2) {
            if (price > MULTI_PATTERN_BONUS) {
                price -= MULTI_PATTERN_BONUS;
            }
        }

        // Ensure minimum price
        if (price < AGENT_MIN_PRICE) {
            price = AGENT_MIN_PRICE;
        }

        return price;
    }

    /**
     * @notice Calculate entropy as percentage of hex+hyphen characters
     */
    function _calculateEntropy(bytes memory b) internal pure returns (uint256) {
        if (b.length == 0) return 0;

        uint256 hexCount = 0;
        for (uint256 i = 0; i < b.length; i++) {
            if (_isHexChar(b[i]) || b[i] == 0x2D) {
                // hex or hyphen
                hexCount++;
            }
        }

        return (hexCount * 100) / b.length;
    }

    // ============ Internal: String Utilities ============

    function _toLower(bytes1 c) internal pure returns (bytes1) {
        if (c >= 0x41 && c <= 0x5A) {
            // A-Z
            return bytes1(uint8(c) + 32);
        }
        return c;
    }

    function _isDigit(bytes1 c) internal pure returns (bool) {
        return c >= 0x30 && c <= 0x39; // 0-9
    }

    function _isHexChar(bytes1 c) internal pure returns (bool) {
        return
            (c >= 0x30 && c <= 0x39) || // 0-9
            (c >= 0x41 && c <= 0x46) || // A-F
            (c >= 0x61 && c <= 0x66); // a-f
    }

    function _endsWithIgnoreCase(
        bytes memory b,
        bytes memory suffix
    ) internal pure returns (bool) {
        if (b.length < suffix.length) return false;

        uint256 start = b.length - suffix.length;
        for (uint256 i = 0; i < suffix.length; i++) {
            if (_toLower(b[start + i]) != _toLower(suffix[i])) {
                return false;
            }
        }
        return true;
    }

    function _startsWithIgnoreCase(
        bytes memory b,
        bytes memory prefix
    ) internal pure returns (bool) {
        if (b.length < prefix.length) return false;

        for (uint256 i = 0; i < prefix.length; i++) {
            if (_toLower(b[i]) != _toLower(prefix[i])) {
                return false;
            }
        }
        return true;
    }

    function _startsWithAtIgnoreCase(
        bytes memory b,
        uint256 offset,
        bytes memory prefix
    ) internal pure returns (bool) {
        if (b.length < offset + prefix.length) return false;

        for (uint256 i = 0; i < prefix.length; i++) {
            if (_toLower(b[offset + i]) != _toLower(prefix[i])) {
                return false;
            }
        }
        return true;
    }

    function _containsIgnoreCase(
        bytes memory b,
        bytes memory pattern
    ) internal pure returns (bool) {
        if (b.length < pattern.length) return false;

        for (uint256 i = 0; i <= b.length - pattern.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < pattern.length; j++) {
                if (_toLower(b[i + j]) != _toLower(pattern[j])) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }

    function _isDatePattern(
        bytes memory b,
        uint256 start
    ) internal pure returns (bool) {
        // Check YYYY-MM-DD format
        if (start + 10 > b.length) return false;

        // YYYY
        for (uint256 i = 0; i < 4; i++) {
            if (!_isDigit(b[start + i])) return false;
        }

        // First hyphen
        if (b[start + 4] != 0x2D) return false;

        // MM
        for (uint256 i = 5; i < 7; i++) {
            if (!_isDigit(b[start + i])) return false;
        }

        // Second hyphen
        if (b[start + 7] != 0x2D) return false;

        // DD
        for (uint256 i = 8; i < 10; i++) {
            if (!_isDigit(b[start + i])) return false;
        }

        return true;
    }

    function _isUUIDFormat(
        bytes memory b,
        uint256 start
    ) internal pure returns (bool) {
        // UUID format: 8-4-4-4-12 (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        if (start + 36 > b.length) return false;

        uint256[] memory groupLengths = new uint256[](5);
        groupLengths[0] = 8;
        groupLengths[1] = 4;
        groupLengths[2] = 4;
        groupLengths[3] = 4;
        groupLengths[4] = 12;

        uint256 pos = start;
        for (uint256 g = 0; g < 5; g++) {
            // Check hex chars
            for (uint256 i = 0; i < groupLengths[g]; i++) {
                if (!_isHexChar(b[pos])) return false;
                pos++;
            }
            // Check hyphen (except after last group)
            if (g < 4) {
                if (b[pos] != 0x2D) return false;
                pos++;
            }
        }

        return true;
    }

    // ============ Internal: USD to Wei Conversion ============

    function _usdToWei(uint256 usdAmount) internal view returns (uint256) {
        (, int256 ethPrice, , , ) = ethUsdOracle.latestRoundData();
        require(ethPrice > 0, "Invalid ETH price");

        // ethPrice is in 8 decimals, usdAmount is in 18 decimals
        // wei = (usd * 1e18) / ethPrice * 1e10
        // Simplified: wei = (usd * 1e8) / ethPrice
        return (usdAmount * 1e8) / uint256(ethPrice);
    }
}
