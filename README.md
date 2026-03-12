# NexID

**NexID** is an interactive identity protocol built on Web3. It combines ENS-style domain names, learn-to-earn education campaigns, and AI-agent-ready identity infrastructure — all built around a `.id` TLD on **Base**.

---

## Repository Structure

| Package | Directory | Description |
|---|---|---|
| **NexID Landing** | [`NexID-Landing/`](./NexID-Landing/) | Marketing and info landing page (React + Vite) |
| **NexAcademy** | [`NexAcademy/`](./NexAcademy/) | Learn-to-earn campaign smart contracts + Next.js web app |
| **NexDomains** | [`NexDomains/`](./NexDomains/) | ENS-inspired `.id` domain system, SDK, frontend, subgraph, and deploy scripts |

---

## Overview

### NexID Landing
A static marketing website built with React, Vite, Tailwind CSS, and shadcn/ui. Showcases the NexID protocol, live campaigns, and links to all product pages.

### NexAcademy
A learn-to-earn platform where protocols can sponsor educational campaigns. Users complete interactive video lessons and on-chain tasks to earn USDC and SBT credentials tied to their `.id` identity.

- Smart contracts: Solidity (campaign escrow, reward distribution) on **Base**
- Web app: Next.js + Prisma backend with a full academy, admin console, and partner portal

### NexDomains
An ENS-compatible decentralized naming system for the `.id` TLD, deployed on **Base**. Includes a TypeScript SDK for AI-agent integrations (x402 / ERC-8004 payment resolution), a React frontend, and a The Graph subgraph for indexed data.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Base (Chain ID 8453) |
| Smart Contracts | Solidity (Hardhat, OpenZeppelin) |
| Frontend | React 18, Next.js, Vite, Tailwind CSS, shadcn/ui |
| Web3 | Wagmi, RainbowKit, Viem, Ethers |
| Indexing | The Graph (GraphQL subgraph) |
| SDK | TypeScript (tsup, Viem) |
| Database | Prisma ORM |

---

## Getting Started

Clone the repository and navigate to the package you want to work with:

```bash
git clone https://github.com/Level3AI-hub/NexID.git
cd NexID

# Landing page
cd NexID-Landing && npm install && npm run dev

# Academy contracts
cd NexAcademy && npm install && npx hardhat compile

# Academy web app
cd NexAcademy/webapp && npm install && npm run dev

# Domains contracts
cd NexDomains && bun install

# Domains frontend
cd NexDomains/frontend && npm install && npm run dev

# Domains SDK
cd NexDomains/sdk && npm install && npm run build
```

---

## Links

- **App**: [nexid.fun](https://nexid.fun)
- **Academy**: [academy.nexid.fun](https://academy.nexid.fun)
- **Domains**: [names.nexid.fun](https://names.nexid.fun)
- **GitHub**: [github.com/Level3AI-hub/NexID](https://github.com/Level3AI-hub/NexID)
- **Docs**: [safuverse.gitbook.io/safuverse-docs](https://safuverse.gitbook.io/safuverse-docs/)
- **Twitter**: [@SafuVerse](https://x.com/SafuVerse)
- **Discord**: [discord.gg/safuverse](https://discord.gg/safuverse)

---

## License

MIT — see individual packages for details.
