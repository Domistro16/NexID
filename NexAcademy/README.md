# NexAcademy

**NexAcademy** is the learn-to-earn education platform within the **NexID** ecosystem. Protocols and partners sponsor educational campaigns — users complete interactive video lessons and on-chain tasks, then earn USDC rewards and SBT credentials tied to their `.id` identity.

Live at **[academy.nexid.fun](https://academy.nexid.fun)**

---

## Repository Structure

| Directory | Description |
|---|---|
| [`contracts/`](./contracts/) | Solidity smart contracts (campaign registry, escrow, ENS integrations) |
| [`webapp/`](./webapp/) | Next.js full-stack web application (academy, admin, partner console) |
| [`scripts/`](./scripts/) | Hardhat contract deployment and task scripts |
| [`test/`](./test/) | Hardhat smart contract test suite |

---

## How It Works

1. **Partner creates a campaign** — deposits USDC into `CampaignEscrow` via the Partner Console
2. **User discovers campaign** — browses campaigns on the Academy homepage
3. **User completes lessons** — watches short video modules and answers quiz questions
4. **User performs on-chain tasks** — e.g., swaps on a DEX; the backend verifies the action occurred
5. **User claims rewards** — gasless USDC claim via a backend relayer on BNB Chain
6. **SBT minted** — campaign completion is recorded as a permanent credential on the user's `.id` profile

---

## Smart Contracts

| Contract | Network | Address |
|---|---|---|
| `NexIDCampaigns` | BSC Mainnet | (see deployments) |
| `PartnerCampaigns` | BSC Mainnet | (see deployments) |
| `CampaignEscrow` | Base Sepolia | (see deployments) |

For full contract documentation see [`contracts/README.md`](./contracts/README.md).

---

## Web App Highlights

The Next.js webapp includes:
- **Academy** (`/academy`) — campaign catalog with enrollment and lesson progress
- **Admin Console** (`/admin`) — internal management dashboard
- **Partner Portal** (`/partner-portal`) — B2B onboarding page for new partners
- **Partner Console** (`/partner-console`) — campaign creation and analytics
- **Points & Leaderboard** (`/points`)
- **AI Chat** (`/chat`) — embedded assistant

For full webapp documentation see [`webapp/README.md`](./webapp/README.md).

---

## Getting Started

### Contracts

```bash
cd NexAcademy
npm install
npx hardhat compile
```

### Web App

```bash
cd NexAcademy/webapp
npm install
npm run dev   # → http://localhost:3000
```

### Environment Variables

- Contracts: copy `.env.example` → `.env` and fill in `API_URL`, `PRIVATE_KEY`, `OWNER_ADDRESS`, `BSCSCAN_API_KEY`
- Webapp: configure `DATABASE_URL`, `NEXTAUTH_SECRET`, and other vars in `webapp/.env`

---

## Networks

| Network | Chain ID | Use |
|---|---|---|
| BSC Mainnet | 56 | Campaign contracts |
| BSC Testnet | 97 | Staging |
| Base Sepolia | 84532 | CampaignEscrow testing |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.28, Hardhat, OpenZeppelin 5.x |
| Web App | Next.js 14, TypeScript, Tailwind CSS, Prisma |
| Web3 | Wagmi, Viem, RainbowKit |
| Database | PostgreSQL via Prisma ORM |
| Blockchain | BNB Smart Chain (BSC) |

---

## License

MIT
