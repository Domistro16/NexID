import hre from 'hardhat'
import { formatEther, parseEther } from 'viem'

/**
 * Comprehensive pricing verification script for SafuDomains v2
 *
 * Tests all pricing rules:
 * - Standard pricing: $2,000 (1 char) to $2 (10+ chars)
 * - Agent pricing: $0.01-$0.10 (only for 10+ chars with pattern match)
 * - Short names with agent patterns should use STANDARD pricing
 * - Disqualified names should use standard pricing
 */

interface TestCase {
  name: string
  expectedType: 'standard' | 'agent' | 'disqualified'
  expectedUsd?: number
  expectedRange?: { min: number; max: number }
}

async function main() {
  console.log('='.repeat(70))
  console.log('SAFUDOMAINS V2 - PRICING VERIFICATION')
  console.log('='.repeat(70))
  console.log('')

  // Deploy contracts for testing
  const dummyOracle = await hre.viem.deployContract('DummyOracle', [200000000000n]) // $2000/ETH
  const agentPriceOracle = await hre.viem.deployContract('AgentPriceOracle', [
    dummyOracle.address,
  ])

  console.log(`DummyOracle deployed at: ${dummyOracle.address}`)
  console.log(`AgentPriceOracle deployed at: ${agentPriceOracle.address}`)
  console.log('')

  // ============ Test 1: Standard Pricing (No Agent Patterns) ============
  console.log('-'.repeat(70))
  console.log('TEST 1: Standard Pricing (No Agent Patterns)')
  console.log('-'.repeat(70))

  const standardTests: TestCase[] = [
    { name: 'a', expectedType: 'standard', expectedUsd: 2000 },        // 1 char
    { name: 'ab', expectedType: 'standard', expectedUsd: 1000 },       // 2 char
    { name: 'abc', expectedType: 'standard', expectedUsd: 200 },       // 3 char
    { name: 'abcd', expectedType: 'standard', expectedUsd: 40 },       // 4 char
    { name: 'abcde', expectedType: 'standard', expectedUsd: 10 },      // 5 char
    { name: 'abcdef', expectedType: 'standard', expectedUsd: 5 },      // 6 char
    { name: 'abcdefgh', expectedType: 'standard', expectedUsd: 5 },    // 8 char
    { name: 'abcdefghi', expectedType: 'standard', expectedUsd: 5 },   // 9 char
    { name: 'abcdefghij', expectedType: 'standard', expectedUsd: 2 },  // 10 char
    { name: 'mysuperlongname', expectedType: 'standard', expectedUsd: 2 }, // 15 char, no pattern
    { name: 'alice', expectedType: 'standard', expectedUsd: 10 },      // 5 char human name
    { name: 'cryptoking', expectedType: 'standard', expectedUsd: 2 },  // 10 char - starts with "crypto" (disqualified)
  ]

  await runTests(agentPriceOracle, standardTests, 'Standard')

  // ============ Test 2: Short Agent Names (Should Use Standard Pricing) ============
  console.log('')
  console.log('-'.repeat(70))
  console.log('TEST 2: Short Names with Agent Patterns (<10 chars = Standard Pricing)')
  console.log('-'.repeat(70))

  const shortAgentTests: TestCase[] = [
    { name: 'ai-bot', expectedType: 'standard', expectedUsd: 5 },      // 6 char - $5
    { name: 'agent-v1', expectedType: 'standard', expectedUsd: 5 },    // 8 char - $5
    { name: 'bot-2024', expectedType: 'standard', expectedUsd: 5 },    // 8 char - $5
    { name: 'edu-tutor', expectedType: 'standard', expectedUsd: 5 },   // 9 char - $5
    { name: 'fleet-ai', expectedType: 'standard', expectedUsd: 5 },    // 8 char - $5
    { name: 'my-agent', expectedType: 'standard', expectedUsd: 5 },    // 8 char - $5
    { name: 'agent-bot', expectedType: 'standard', expectedUsd: 5 },   // 9 char - $5
  ]

  await runTests(agentPriceOracle, shortAgentTests, 'Short Agent Names')

  // ============ Test 3: Valid Agent Names (10+ chars + pattern = $0.01-$0.10) ============
  console.log('')
  console.log('-'.repeat(70))
  console.log('TEST 3: Valid Agent Names (10+ chars + pattern = $0.01-$0.10)')
  console.log('-'.repeat(70))

  const agentTests: TestCase[] = [
    // Suffix patterns
    { name: 'personal-learning-agent', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'auto-trading-bot-v1', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },  // NOT crypto- prefix
    { name: 'sentiment-analyzer-ai', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'content-model-tutor', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },

    // Version patterns
    { name: 'trading-system-v42', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'analyzer-version12', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'bot-2026-02-04', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'agent-epoch1707091200', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },

    // UUID patterns
    { name: 'agent-7f3a9b2c-1d4e-4f2a-8b6c-9e1234567890', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'bot-a1b2c3d4e5f67890123456789012', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },

    // Prefix patterns
    { name: 'agent-portfolio-manager', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'fleet-coordinator-alpha', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'swarm-worker-node-01', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },

    // Functional patterns (NOT using crypto- prefix which is disqualified)
    { name: 'data-analyzer-v2-prod', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'content-generator-main', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'course-synthesizer-beta', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
  ]

  await runTests(agentPriceOracle, agentTests, 'Agent Names')

  // ============ Test 4: Disqualified Names (10+ chars + pattern BUT starts with banned word) ============
  console.log('')
  console.log('-'.repeat(70))
  console.log('TEST 4: Disqualified Names (banned prefix = Standard Pricing)')
  console.log('-'.repeat(70))

  const disqualifiedTests: TestCase[] = [
    { name: 'best-trading-agent', expectedType: 'disqualified', expectedUsd: 2 },
    { name: 'pro-analyzer-bot-v2', expectedType: 'disqualified', expectedUsd: 2 },
    { name: 'elite-fleet-manager', expectedType: 'disqualified', expectedUsd: 2 },
    { name: 'vip-content-generator', expectedType: 'disqualified', expectedUsd: 2 },
    { name: 'king-crypto-bot-alpha', expectedType: 'disqualified', expectedUsd: 2 },
    { name: 'ninja-trader-agent', expectedType: 'disqualified', expectedUsd: 2 },
    { name: 'alpha-signal-bot-v1', expectedType: 'disqualified', expectedUsd: 2 },
    { name: 'crypto-trading-agent', expectedType: 'disqualified', expectedUsd: 2 },
    { name: 'moon-landing-bot-ai', expectedType: 'disqualified', expectedUsd: 2 },
  ]

  await runTests(agentPriceOracle, disqualifiedTests, 'Disqualified Names')

  // ============ Test 5: Edge Cases ============
  console.log('')
  console.log('-'.repeat(70))
  console.log('TEST 5: Edge Cases')
  console.log('-'.repeat(70))

  const edgeCases: TestCase[] = [
    // Exactly 10 characters with agent pattern - should be agent
    { name: 'agent-bot1', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },

    // Exactly 9 characters with agent pattern - should be standard
    { name: 'agent-bot', expectedType: 'standard', expectedUsd: 5 },

    // 13 characters with pattern - should be agent
    { name: 'agent-handler', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },

    // Mixed case - should be case-insensitive and detected as agent
    { name: 'AGENT-TRADING-BOT', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },
    { name: 'Fleet-Manager-V2', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },

    // Multiple patterns - should still be agent
    { name: 'agent-analyzer-v2-bot', expectedType: 'agent', expectedRange: { min: 0.01, max: 0.10 } },

    // No hyphens but has pattern keywords - should NOT be agent (no clear pattern separation)
    { name: 'agentbottrader', expectedType: 'standard', expectedUsd: 2 },
  ]

  await runTests(agentPriceOracle, edgeCases, 'Edge Cases')

  console.log('')
  console.log('='.repeat(70))
  console.log('VERIFICATION COMPLETE')
  console.log('='.repeat(70))
}

async function runTests(oracle: any, tests: TestCase[], category: string) {
  let passed = 0
  let failed = 0

  for (const tc of tests) {
    try {
      const price = await oracle.read.getPrice([tc.name])
      const usdNum = Number(formatEther(price.priceUsd))
      const isAgent = price.isAgentName

      let status = '✅ PASS'
      let expectedStr = ''
      let actualStr = `$${usdNum.toFixed(2)}`

      if (tc.expectedType === 'agent') {
        expectedStr = `$${tc.expectedRange!.min}-$${tc.expectedRange!.max}`
        if (!isAgent) {
          status = '❌ FAIL'
          failed++
        } else if (usdNum < tc.expectedRange!.min || usdNum > tc.expectedRange!.max) {
          status = '❌ FAIL (price out of range)'
          failed++
        } else {
          passed++
        }
        actualStr += isAgent ? ' (AGENT)' : ' (STANDARD)'
      } else {
        // standard or disqualified - both should NOT be agent
        expectedStr = `$${tc.expectedUsd}`
        if (isAgent) {
          status = '❌ FAIL (should NOT be agent)'
          failed++
        } else if (Math.abs(usdNum - tc.expectedUsd!) > 0.001) {
          status = `❌ FAIL (expected $${tc.expectedUsd})`
          failed++
        } else {
          passed++
        }
        actualStr += ' (STANDARD)'
      }

      const typeLabel = tc.expectedType === 'agent' ? '🤖' : tc.expectedType === 'disqualified' ? '🚫' : '📦'
      console.log(`${status} ${typeLabel} "${tc.name}" (${tc.name.length} chars)`)
      console.log(`       Expected: ${expectedStr} | Actual: ${actualStr}`)
    } catch (e: any) {
      console.log(`❌ ERROR "${tc.name}": ${e.message}`)
      failed++
    }
  }

  console.log('')
  console.log(`${category}: ${passed} passed, ${failed} failed`)
}

main().catch(console.error)
