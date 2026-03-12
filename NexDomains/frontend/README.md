# NexDomains — Frontend

The React web application for the **NexDomains** `.id` domain registration and management system on **Base**, deployed at **[names.nexid.fun](https://names.nexid.fun)**.

## Features

- **Domain Search & Registration** — Real-time availability checking with multi-token payment support
- **Multi-Token Pricing** — Pay with ETH or USDC; prices fetched from Chainlink oracles on Base
- **Domain Management** — Set resolver records, transfer ownership, renew domains, manage subdomains
- **Referral System** — Share referral links, track earnings, and receive automatic on-chain rewards
- **Auctions** — Domain auction UI for contested names
- **Profile & Portfolio** — View owned `.id` names and manage their records
- **Fiat On-Ramp** — Transak integration for buying crypto with a credit card
- **Social Login** — Web3Auth for email/social wallet creation in addition to standard Web3 wallets
- **GraphQL Explorer** (`/api-docs`) — In-app subgraph query explorer

## Tech Stack

| Tool | Purpose |
|---|---|
| Next.js 14 (App Router) | Full-stack React framework |
| TypeScript | Type safety |
| Tailwind CSS 4 | Utility-first styling |
| Wagmi v2 | Base chain wallet hooks |
| RainbowKit | Wallet connection UI |
| Viem | Ethereum type-safe utilities |
| Ethers v5 | Legacy contract interactions |
| Apollo Client | GraphQL querying (The Graph) |
| Axios | REST API calls |
| Web3Auth | Social login |
| Transak SDK | Fiat on-ramp |
| Fabric.js | Canvas-based NFT avatar rendering |
| Flutterwave | Alternative payment processing |

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx           # Home / domain search page
│   ├── layout.tsx         # Root layout with providers
│   ├── providers.tsx      # Wagmi, RainbowKit, Query, Web3Auth providers
│   ├── globals.css        # Global styles and Tailwind base
│   ├── admin/             # Internal admin panel
│   ├── api/               # API route handlers
│   ├── api-docs/          # GraphQL explorer UI
│   ├── auctions/          # Domain auction pages
│   ├── dashboard/         # User dashboard
│   ├── mynames/           # Owned domains view
│   ├── pay/               # x402 payment resolution UI
│   ├── pricing/           # Pricing breakdown page
│   ├── profile/           # Public and private profile pages
│   └── register/          # Registration flow
│   └── resolve/           # Name-to-address resolver
├── components/            # Shared UI components
├── constants/             # Contract addresses and chain config
├── hooks/                 # Custom React hooks
├── lib/                   # Shared utilities and helpers
├── utils/                 # Misc utility functions
├── constant.ts            # Deployed contract addresses (Base)
├── nexid-sdk.d.ts         # Type declarations for @nexid/sdk
├── next.config.js         # Next.js configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Dependencies and scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm (or bun)

### Install

```bash
npm install
# or
bun install
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Web3Auth (social login)
VITE_CLIENT_ID=your_web3auth_client_id

# WalletConnect
VITE_WC_PROJECT_ID=your_walletconnect_project_id

# Flutterwave payments (optional)
VITE_FLUTTERWAVE_KEY=your_flutterwave_key

# Backend API
VITE_API_URL=https://api.nexid.fun
VITE_API_KEY=your_api_key
```

A full reference is available in `.env.example`.

### Development

```bash
npm run dev
# → http://localhost:3000
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Deployed Contract Addresses (Base Mainnet)

Set in `constant.ts`:

| Contract | Address |
|---|---|
| AgentRegistrarController | `0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494` |
| Registry | `0xA590B208e7F2e62a3987424D2E1b00cd62986fAd` |
| ReverseRegistrar | `0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA` |
| BaseRegistrar | `0xCAfd2aCA95B79Ce2De0047F2309FCaB33Da75E9C` |
| NameWrapper | `0x90d848F20589437EF2e05a91130aEEA253512736` |
| AgentPublicResolver | `0x0a8C0f71C3Ec3FC8cB59F27885eb52C033780b6f` |
| ReferralVerifier | `0x212c27756529679efBd46cb35440b2e4DC28e33C` |

## Wallet Support

Through RainbowKit and Web3Auth:
- MetaMask
- Coinbase Wallet
- Rainbow
- WalletConnect (mobile wallets)
- Web3Auth social login (Google, Twitter, email)

## Deployment

The app can be deployed to Vercel, Netlify, or any Node.js host:

```bash
# Vercel
vercel
```

A `vercel.json` is included for zero-config Vercel deployment.

## Troubleshooting

| Issue | Fix |
|---|---|
| Wallet won't connect | Ensure you're on Base (Chain ID: 8453) |
| Build errors with polyfills | Check `vite-plugin-node-polyfills` in `next.config.js` |
| Env vars not working | Prefix with `VITE_`; restart dev server after changes |
| GraphQL data missing | Verify subgraph endpoint in Apollo client config |

## License

MIT
