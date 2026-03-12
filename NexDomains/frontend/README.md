# NexDomains — Frontend

The React web application for the **NexDomains** `.id` domain registration and management system. Deployed at **[names.nexid.fun](https://names.nexid.fun)** (previously `names.safuverse.com`).

## Features

- **Domain Search & Registration** — Real-time availability checking with multi-token payment support
- **Multi-Token Pricing** — Pay with BNB, CAKE, or USD1; prices fetched from Chainlink oracles
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
| Wagmi v2 | BNB Chain wallet hooks |
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
│   └── (43 components)    # Navbar, modals, domain cards, forms, etc.
├── constants/             # Contract addresses and chain config
├── hooks/                 # Custom React hooks (17 hooks)
├── lib/                   # Shared utilities and helpers
├── utils/                 # Misc utility functions
├── constant.ts            # Deployed contract addresses
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

## Deployed Contract Addresses (BSC Mainnet)

These are set in `constant.ts`:

| Contract | Address |
|---|---|
| Controller | `0x48511b6c15fe1F89bAf6b30dBFA35bF0eAaEB751` |
| Registry | `0x6aEFc7ac590096c08187a9052030dA59dEd7E996` |
| ReverseRegistrar | `0xc070aAcE207ad5eb2A460D059785ffC9D4D2C536` |
| BaseRegistrar | `0xc85f95FCe09b582D546606f591CEEC88D88714f5` |
| NameWrapper | `0x86a930d1931C11e3Ec46b3A050E27F29bF94B612` |
| PublicResolver | `0xcAa73Cd19614523F9F3cfCa4A447120ceA8fd357` |
| Referral | `0x182690bD985ef02Ae44A6F8a2e71666bDe1196E2` |

## Wallet Support

Through RainbowKit and Web3Auth:
- MetaMask
- Binance Wallet (W3W connector)
- Rainbow
- Coinbase Wallet
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
| Wallet won't connect | Ensure you're on BNB Chain (Chain ID: 56) |
| Build errors with polyfills | Check `vite-plugin-node-polyfills` in `next.config.js` |
| Env vars not working | Prefix with `VITE_`; restart dev server after changes |
| GraphQL data missing | Verify subgraph endpoint in Apollo client config |

## License

MIT
