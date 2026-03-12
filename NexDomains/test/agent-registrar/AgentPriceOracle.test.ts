import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers.js'
import { expect } from 'chai'
import hre from 'hardhat'

/**
 * AgentPriceOracle Tests
 * 
 * Tests for pattern matching and pricing logic:
 * - All 5 pattern categories (suffix, version, UUID, prefix, functional)
 * - Disqualifying word rejection
 * - Entropy calculation
 * - Standard vs agent pricing
 */

async function fixture() {
    const publicClient = await hre.viem.getPublicClient()

    // Deploy mock ETH/USD oracle ($2000/ETH for predictable test values)
    const dummyOracle = await hre.viem.deployContract('DummyOracle', [200000000000n]) // $2000 with 8 decimals

    // Deploy AgentPriceOracle
    const agentPriceOracle = await hre.viem.deployContract('AgentPriceOracle', [
        dummyOracle.address,
    ])

    return {
        agentPriceOracle,
        dummyOracle,
        publicClient,
    }
}

describe('AgentPriceOracle', () => {
    describe('isAgentName', () => {
        // ============ Category A: Suffix Patterns ============
        describe('Category A - Suffix Patterns', () => {
            it('should detect -agent suffix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['personal-learning-agent'])).to.equal(true)
            })

            it('should detect -bot suffix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['auto-trading-bot-v1'])).to.equal(true)
            })

            it('should detect -ai suffix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['assistant-helper-ai'])).to.equal(true)
            })

            it('should detect -llm suffix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['language-model-llm'])).to.equal(true)
            })

            it('should detect -gpt suffix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['custom-trained-gpt'])).to.equal(true)
            })

            it('should detect -tutor suffix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['math-learning-tutor'])).to.equal(true)
            })

            it('should detect -credential suffix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['university-degree-credential'])).to.equal(true)
            })
        })

        // ============ Category B: Version/Timestamp Patterns ============
        describe('Category B - Version Patterns', () => {
            it('should detect -v{number} pattern', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['tutor-agent-v42'])).to.equal(true)
            })

            it('should detect -v1 pattern', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['my-super-agent-v1'])).to.equal(true)
            })

            it('should detect timestamp pattern (8+ digits)', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['ai-edu-20260204'])).to.equal(true)
            })

            it('should detect -epoch pattern', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['agent-epoch1707050400'])).to.equal(true)
            })
        })

        // ============ Category C: UUID Patterns ============
        describe('Category C - UUID Patterns', () => {
            it('should detect full UUID v4 pattern', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['agent-7f3a9b2c-1d4e-4f2a-8b6c-9e1234567890'])).to.equal(true)
            })

            it('should detect hex string pattern (32+ chars)', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['agent-7f3a9b2c1d4e4f2a8b6c9e1234567890'])).to.equal(true)
            })
        })

        // ============ Category D: Prefix Patterns ============
        describe('Category D - Prefix Patterns', () => {
            it('should detect agent- prefix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['agent-portfolio-manager'])).to.equal(true)
            })

            it('should detect fleet- prefix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['fleet-coordinator-alpha'])).to.equal(true)
            })

            it('should detect bot- prefix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['bot-trading-executor'])).to.equal(true)
            })

            it('should detect id-agent- prefix', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['id-agent-validator'])).to.equal(true)
            })
        })

        // ============ Category E: Functional Patterns ============
        describe('Category E - Functional Patterns', () => {
            it('should detect -analyzer- pattern', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['data-analyzer-v2-prod'])).to.equal(true)
            })

            it('should detect -generator- pattern', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['course-generator-bot-v1'])).to.equal(true)
            })

            it('should detect -task- pattern', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['ai-task-scheduler-main'])).to.equal(true)
            })
        })

        // ============ Negative Cases ============
        describe('Negative Cases - Should NOT be agent names', () => {
            it('should reject names shorter than 10 chars', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['agent'])).to.equal(false)
                expect(await agentPriceOracle.read.isAgentName(['my-agent'])).to.equal(false)
            })

            it('should reject short names with agent patterns (<10 chars)', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                // These match agent patterns BUT are <10 chars, so should NOT be agents
                expect(await agentPriceOracle.read.isAgentName(['ai-bot'])).to.equal(false)    // 6 chars
                expect(await agentPriceOracle.read.isAgentName(['agent-v1'])).to.equal(false)  // 8 chars
                expect(await agentPriceOracle.read.isAgentName(['bot-2024'])).to.equal(false)  // 8 chars
                expect(await agentPriceOracle.read.isAgentName(['agent-bot'])).to.equal(false) // 9 chars
            })

            it('should use standard pricing for short names with patterns', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                // Short names with patterns should get standard $5 pricing (6-9 chars)
                const price = await agentPriceOracle.read.getPrice(['agent-bot']) // 9 chars
                expect(price.isAgentName).to.equal(false)
                expect(price.priceUsd).to.equal(5n * 10n ** 18n) // $5, not $0.01-$0.10
            })

            it('should reject names with disqualifying words', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['besttrader-agent-v1'])).to.equal(false)
                expect(await agentPriceOracle.read.isAgentName(['protrading-agent-bot'])).to.equal(false)
                expect(await agentPriceOracle.read.isAgentName(['cryptoking-agent-ai'])).to.equal(false)
                expect(await agentPriceOracle.read.isAgentName(['moonshot-agent-llm'])).to.equal(false)
            })

            it('should reject standard human names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['alice'])).to.equal(false)
                expect(await agentPriceOracle.read.isAgentName(['johnsmith'])).to.equal(false)
            })

            it('should reject names without pattern match', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['mycoolagentname'])).to.equal(false) // no hyphens, no pattern
            })
        })

        // ============ Edge Cases ============
        describe('Edge Cases', () => {
            it('should accept exactly 10 chars with pattern as agent', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                // "agent-bot1" is exactly 10 chars with prefix pattern
                expect(await agentPriceOracle.read.isAgentName(['agent-bot1'])).to.equal(true)
            })

            it('should reject exactly 9 chars with pattern as standard', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                // "agent-bot" is 9 chars - should be standard
                expect(await agentPriceOracle.read.isAgentName(['agent-bot'])).to.equal(false)
            })

            it('should be case-insensitive for pattern matching', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                expect(await agentPriceOracle.read.isAgentName(['AGENT-TRADING-BOT'])).to.equal(true)
                expect(await agentPriceOracle.read.isAgentName(['Fleet-Manager-V2'])).to.equal(true)
            })
        })
    })

    describe('getPatternMatchCount', () => {
        it('should count single pattern match', async () => {
            const { agentPriceOracle } = await loadFixture(fixture)
            const count = await agentPriceOracle.read.getPatternMatchCount(['personal-learning-agent'])
            expect(count).to.equal(1n)
        })

        it('should count multiple pattern matches', async () => {
            const { agentPriceOracle } = await loadFixture(fixture)
            // fleet- prefix + -v2 version = 2 patterns
            const count = await agentPriceOracle.read.getPatternMatchCount(['fleet-coordinator-alpha-v2'])
            expect(count).to.be.greaterThanOrEqual(2n)
        })
    })

    describe('getPrice', () => {
        // ============ Standard Pricing ============
        describe('Standard Names (non-agent)', () => {
            it('should return $2000 for 1-char names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const price = await agentPriceOracle.read.getPrice(['a'])
                expect(price.isAgentName).to.equal(false)
                expect(price.priceUsd).to.equal(2000n * 10n ** 18n)
            })

            it('should return $1000 for 2-char names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const price = await agentPriceOracle.read.getPrice(['ab'])
                expect(price.isAgentName).to.equal(false)
                expect(price.priceUsd).to.equal(1000n * 10n ** 18n)
            })

            it('should return $200 for 3-char names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const price = await agentPriceOracle.read.getPrice(['abc'])
                expect(price.isAgentName).to.equal(false)
                expect(price.priceUsd).to.equal(200n * 10n ** 18n)
            })

            it('should return $40 for 4-char names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const price = await agentPriceOracle.read.getPrice(['test'])
                expect(price.isAgentName).to.equal(false)
                expect(price.priceUsd).to.equal(40n * 10n ** 18n)
            })

            it('should return $10 for 5-char names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const price = await agentPriceOracle.read.getPrice(['alice'])
                expect(price.isAgentName).to.equal(false)
                expect(price.priceUsd).to.equal(10n * 10n ** 18n)
            })

            it('should return $5 for 6-char names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const price = await agentPriceOracle.read.getPrice(['abcdef'])
                expect(price.isAgentName).to.equal(false)
                expect(price.priceUsd).to.equal(5n * 10n ** 18n)
            })

            it('should return $5 for 9-char names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const price = await agentPriceOracle.read.getPrice(['abcdefghi'])
                expect(price.isAgentName).to.equal(false)
                expect(price.priceUsd).to.equal(5n * 10n ** 18n)
            })

            it('should return $2 for 10+ char names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const price = await agentPriceOracle.read.getPrice(['verylongname'])
                expect(price.isAgentName).to.equal(false)
                expect(price.priceUsd).to.equal(2n * 10n ** 18n)
            })
        })

        // ============ Agent Pricing ============
        describe('Agent Names', () => {
            it('should return $0.01-$0.10 for agent names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const price = await agentPriceOracle.read.getPrice(['personal-learning-agent'])
                expect(price.isAgentName).to.equal(true)
                expect(price.priceUsd).to.be.greaterThanOrEqual(10000000000000000n) // $0.01
                expect(price.priceUsd).to.be.lessThanOrEqual(100000000000000000n) // $0.10
            })

            it('should apply length bonus for longer agent names', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const shortAgent = await agentPriceOracle.read.getPrice(['my-super-agent-v1']) // minimal length
                const longAgent = await agentPriceOracle.read.getPrice(['my-extremely-long-super-agent-v1']) // longer

                // Longer names should be cheaper due to length bonus
                expect(longAgent.priceUsd).to.be.lessThanOrEqual(shortAgent.priceUsd)
            })

            it('should apply multi-pattern bonus', async () => {
                const { agentPriceOracle } = await loadFixture(fixture)
                const singlePattern = await agentPriceOracle.read.getPrice(['personal-learning-agent']) // suffix only
                const multiPattern = await agentPriceOracle.read.getPrice(['agent-portfolio-manager-v2']) // prefix + version

                // Multi-pattern should be cheaper
                expect(multiPattern.priceUsd).to.be.lessThanOrEqual(singlePattern.priceUsd)
            })
        })
    })
})
