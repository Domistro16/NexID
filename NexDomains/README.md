# NexDomains

**NexDomains** is a decentralized naming system for the `.id` TLD — an ENS-compatible domain registrar deployed on **Base**, extended with multi-token pricing, an on-chain referral system, and AI-agent-ready identity (x402 / ERC-8004).

Live at **[names.nexid.fun](https://names.nexid.fun)**

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
- **Multi-Token Pricing** — Pay with ETH or USDC; Chainlink oracles determine USD-equivalent pricing at checkout
- **Referral Rewards** — On-chain referral tracking with automatic reward distribution
- **Name Wrapper** — Wrap `.id` NFTs with fuse-based sub-name delegation
- **Agent Names** — Discounted pricing for AI agent identities (10+ character names) with x402 payment resolution
- **Reverse Resolution** — Map wallet address → primary `.id` name

---

## Deployed Contracts (Base Mainnet — Chain ID 8453)

| Contract | Address |
|---|---|
| AgentRegistrarController | `0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494` |
| Registry | `0xA590B208e7F2e62a3987424D2E1b00cd62986fAd` |
| ReverseRegistrar | `0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA` |
| BaseRegistrar | `0xCAfd2aCA95B79Ce2De0047F2309FCaB33Da75E9C` |
| NameWrapper | `0x90d848F20589437EF2e05a91130aEEA253512736` |
| AgentPublicResolver | `0x0a8C0f71C3Ec3FC8cB59F27885eb52C033780b6f` |
| AgentPriceOracle | `0x15E2ccAeb4D1eeA1A7b8d839FFA30D63519D1c50` |
| ReferralVerifier | `0x212c27756529679efBd46cb35440b2e4DC28e33C` |

### Base Sepolia (Chain ID 84532 — Testnet)

| Contract | Address |
|---|---|
| AgentRegistrarController | `0x64E86C4F19FC37Fe6c662F83dd4EB932bA601DC2` |
| Registry | `0x60b5c974D939C56A0b02EAaC197F57e0B3cf937b` |
| ReverseRegistrar | `0x6516d242117CE3Be817aeBF39e7e3A044F62D81C` |
| BaseRegistrar | `0x0Ba17Ee6c8d745F5bDB710Fead7d85ceE17E5622` |
| NameWrapper | `0x1A7EB9815b6B1014A542CE0628D8FC65Bc5Cb653` |
| AgentPublicResolver | `0x82fAa0d80dFFeFadF962C5f2DDBFeE92ABF500C5` |

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
| Base Mainnet | 8453 | Primary production |
| Base Sepolia | 84532 | Testnet / staging |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.17, Hardhat, OpenZeppelin |
| Frontend | Next.js 14, TypeScript, Tailwind CSS 4, Wagmi, RainbowKit |
| Web3 | Viem, Ethers v5, Apollo Client (GraphQL) |
| Indexing | The Graph (AssemblyScript subgraph) |
| SDK | TypeScript (tsup, Viem) — published as `@nexid/sdk` |
| Oracles | Chainlink ETH/USD price feeds on Base |
| Blockchain | Base (Coinbase L2) |

---

## ENS Documentation

This system is built on top of the ENS protocol. For ENS reference documentation, see [docs.ens.domains](https://docs.ens.domains/).

---

## Release Flow

1. Feature branch from `staging`
2. Deploy to Base Sepolia testnet → create `v1.2.3-testnet` GitHub release
3. Audit (if required)
4. Deploy to Base Mainnet from `staging` → create `v1.2.3` release
5. Merge into `main`

---

## Support

- **Live App**: [names.nexid.fun](https://names.nexid.fun)
- **GitHub**: [github.com/Level3AI-hub/NexID](https://github.com/Level3AI-hub/NexID)
- **Docs**: [safuverse.gitbook.io](https://safuverse.gitbook.io/safuverse-docs/)
- **Twitter**: [@SafuVerse](https://x.com/SafuVerse)
- **Discord**: [discord.gg/safuverse](https://discord.gg/safuverse)

---

## License

MIT
