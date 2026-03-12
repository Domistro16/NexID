# @nexid/sdk

TypeScript SDK for interacting with **NexDomains v2** smart contracts — an ENS-compatible `.id` domain registrar optimized for AI agents, built on **Base**.

Published as: `@nexid/sdk` (v1.0.7)

## Features

- Register `.id` domain names (standard and batch)
- Discounted **agent name** pricing for names ≥10 characters matching AI agent patterns
- **x402 / ERC-8004** payment resolution: set and get payment endpoints, addresses, and supported chains
- Namehash and full-name utilities
- Built with Viem — no ethers.js dependency

## Installation

```bash
npm install @nexid/sdk viem
```

## Quick Start

```typescript
import { NexDomains } from '@nexid/sdk'
import { createWalletClient, http } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

const account = privateKeyToAccount('0x...')
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(),
})

const sdk = new NexDomains({
  chainId: 8453,  // Base Mainnet (use 84532 for Base Sepolia testnet)
  walletClient,
})

// Check availability
const available = await sdk.available('my-trading-agent')

// Get price
const { priceWei, priceUsd, isAgentName } = await sdk.getPrice('my-trading-agent')

// Register
const txHash = await sdk.register('my-trading-agent')
```

## API

### Registration

```typescript
// Register a single name
await sdk.register('my-agent')

// Batch register multiple names
await sdk.batchRegister(['agent-one', 'agent-two', 'agent-three'])
```

### Pricing

```typescript
// Get price for any name
const price = await sdk.getPrice('my-agent-bot')
// → { priceWei: BigInt, priceUsd: BigInt, isAgentName: boolean }

// Check if a name qualifies for agent pricing
const isAgent = await sdk.isAgentName('ai-task-runner')

// Count agent-pattern keyword matches
const count = await sdk.getPatternMatchCount('ai-trading-bot-v2')
```

### Pricing Reference

| Length | Standard Price | Agent Price (10+ chars) |
|---|---|---|
| 1 char | $2,000 | — |
| 2 chars | $1,000 | — |
| 3 chars | $200 | — |
| 4 chars | $40 | — |
| 5 chars | $10 | — |
| 6–9 chars | $5 | — |
| 10+ chars | $2 | $0.01 – $0.10 |

### x402 / ERC-8004 Payment Resolution

```typescript
// Set and get payment endpoint
await sdk.setX402Endpoint('my-agent', 'https://api.myagent.com/x402')
const endpoint = await sdk.getX402Endpoint('my-agent')

// Set and get payment address for a specific chain
await sdk.setPaymentAddress('my-agent', 8453, '0x...')
const addr = await sdk.getPaymentAddress('my-agent', 8453)

// Configure supported chains for a domain
await sdk.setSupportedChains('my-agent', [8453, 1, 137])

// Get full payment profile
const profile = await sdk.getPaymentProfile('my-agent', 8453)
```

### Utilities

```typescript
// Get domain owner
const owner = await sdk.getOwner('my-agent')

// Calculate ENS namehash
const node = sdk.namehash('my-agent')

// Get full name with TLD
const full = sdk.getFullName('my-agent')  // "my-agent.id"
```

## Project Structure

```
sdk/
├── src/
│   ├── index.ts          # Main SDK class and exports
│   └── constants.ts      # Contract addresses for Base Mainnet + Base Sepolia
├── dist/                 # Built output (CJS + ESM + types)
├── tsconfig.json         # TypeScript configuration
└── package.json          # Package metadata and scripts
```

## Networks

| Network | Chain ID | Status |
|---|---|---|
| Base Mainnet | 8453 | Production |
| Base Sepolia | 84532 | Testnet |

## Development

```bash
# Install dependencies
npm install

# Build (CJS + ESM)
npm run build

# Build in watch mode
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## License

MIT
