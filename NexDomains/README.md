# NexDomains

**NexDomains** is a decentralized naming system for the `.id` TLD — an ENS-compatible domain registrar deployed on **BNB Smart Chain**, extended with multi-token pricing, an on-chain referral system, and AI-agent-ready identity (x402 / ERC-8004).

Live at **[names.nexid.fun](https://names.nexid.fun)** (previously `names.safuverse.com`)

---

## Repository Structure

| Directory | Description |
|---|---|
| [`contracts/`](./contracts/) | Solidity smart contracts (registry, registrar, resolvers, wrapper, etc.) |
| [`deploy/`](./deploy/) | Hardhat-deploy scripts organized by contract component |
| [`deployments/`](./deployments/) | Saved deployment artifacts per network |
| [`frontend/`](./frontend/) | Next.js web application for domain registration and management |
| [`sdk/`](./sdk/) | `@nexid/sdk` — TypeScript SDK for domain registration and x402 agent identity |
| [`subgraph/`](./subgraph/) | The Graph subgraph for indexing all domain events |
| [`scripts/`](./scripts/) | Utility scripts (ENS test, migration helpers, etc.) |
| [`tasks/`](./tasks/) | Hardhat tasks |
| [`test/`](./test/) | Hardhat contract test suite |

---

## Key Features

- **`.id` Domain Registration** — ENS-compatible register/renew/transfer with commit/reveal anti-frontrunning
- **Multi-Token Pricing** — Pay with BNB, CAKE, or USD1; Chainlink oracles determine USD-equivalent pricing at checkout
- **Referral Rewards** — On-chain referral tracking with automatic BNB/CAKE/USD1 distribution
- **Name Wrapper** — Wrap `.id` NFTs with fuse-based sub-name delegation
- **Agent Names** — Discounted pricing for AI agent identities (10+ character names) with x402 payment resolution
- **Reverse Resolution** — Map wallet address → primary `.id` name

---

## Deployed Contracts (BSC Mainnet — Chain ID 56)

| Contract | Address |
|---|---|
| Controller | `0x48511b6c15fe1F89bAf6b30dBFA35bF0eAaEB751` |
| Registry | `0x6aEFc7ac590096c08187a9052030dA59dEd7E996` |
| ReverseRegistrar | `0xc070aAcE207ad5eb2A460D059785ffC9D4D2C536` |
| BaseRegistrar | `0xc85f95FCe09b582D546606f591CEEC88D88714f5` |
| NameWrapper | `0x86a930d1931C11e3Ec46b3A050E27F29bF94B612` |
| PublicResolver | `0xcAa73Cd19614523F9F3cfCa4A447120ceA8fd357` |
| Referral | `0x182690bD985ef02Ae44A6F8a2e71666bDe1196E2` |

---

## Getting Started

### Contracts

```bash
bun install   # or npm install
npx hardhat compile
bun run test
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # → http://localhost:3000
```

### SDK

```bash
cd sdk
npm install
npm run build
```

### Subgraph

```bash
cd subgraph
yarn install
npx graph codegen && npx graph build
```

---

## Pre-Deployment Checklist

To fork this system for a different TLD (e.g. `.nex`):

1. Replace all `.id` occurrences in contracts and scripts with your TLD
2. Update `CRE8OR_NODE` → `Namehash(<YourTLD>)`
3. Update `CRE8OR_LABELHASH` → `keccak256(<YourTLD>)`
4. Update `names[CRE8OR_NODE]` → DNS-encoded TLD (e.g. `"\x03nex\x00"` for `.nex`)

---

## Networks

| Network | Chain ID | Purpose |
|---|---|---|
| BSC Mainnet | 56 | Primary production |
| BSC Testnet | 97 | Staging |
| Plasma Network | 9745 | Alternative BNB deployment |
| Base Mainnet | 8453 | SDK / AgentRegistrar |
| Base Sepolia | 84532 | SDK testnet |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.17, Hardhat, OpenZeppelin |
| Frontend | Next.js 14, TypeScript, Tailwind CSS 4, Wagmi, RainbowKit |
| Web3 | Viem, Ethers v5, Apollo Client (GraphQL) |
| Indexing | The Graph (AssemblyScript subgraph) |
| SDK | TypeScript (tsup, Viem) — published as `@nexid/sdk` |
| Oracles | Chainlink BNB/USD + CAKE/USD price feeds on BSC |
| DEX | PancakeSwap V3 (CAKE token payments) |

---

## ENS Documentation

This system is built on top of the ENS protocol. For ENS reference documentation, see [docs.ens.domains](https://docs.ens.domains/).

---

## Release Flow

1. Feature branch from `staging`
2. Deploy to testnet → create `v1.2.3-testnet` GitHub release
3. Audit (if required)
4. Deploy to mainnet from `staging` → create `v1.2.3` release
5. Merge into `main`

---

## Support

- **Live App**: [names.nexid.fun](https://names.nexid.fun)
- **Docs**: [safuverse.gitbook.io](https://safuverse.gitbook.io/safuverse-docs/)
- **Email**: info@level3labs.fun
- **Twitter**: [@SafuVerse](https://x.com/SafuVerse)
- **Discord**: [discord.gg/safuverse](https://discord.gg/safuverse)

---

## License

MIT
