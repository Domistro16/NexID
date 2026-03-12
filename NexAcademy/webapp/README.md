# NexAcademy — Web App

The Next.js web application powering the **NexAcademy** learn-to-earn platform. Users connect their `.id` wallet identity, explore campaigns, complete video lessons and on-chain tasks, and claim USDC rewards.

Live at **[academy.nexid.fun](https://academy.nexid.fun)** (previously `academy.safuverse.com`).

## Features

- **Academy**: Browse and enroll in learn-to-earn campaigns
- **Interactive Lessons**: Short video modules with knowledge check quizzes
- **On-Chain Task Verification**: Backend checks whether users completed swaps, mints, or other DeFi actions
- **Reward Claims**: Gasless USDC claim flow via a backend relayer
- **Partner Console**: B2B portal for protocols to create and manage campaigns
- **Admin Panel**: Internal dashboard for campaign management and user analytics
- **AI Chat Widget**: Embedded assistant for learner support

## Tech Stack

| Tool | Purpose |
|---|---|
| Next.js 14 (App Router) | Full-stack React framework |
| TypeScript | Type safety |
| Tailwind CSS | Utility-first styling |
| Prisma ORM | Database access (PostgreSQL) |
| NextAuth | Wallet-based authentication |
| Wagmi + Viem | Base chain contract reads |
| TanStack Query | Server state management |
| SCORM | Video lesson format support |
| Merkle trees | Reward eligibility proofs |

## Project Structure

```
webapp/
├── app/
│   ├── page.tsx              # Public landing / home page
│   ├── layout.tsx            # Root layout with providers
│   ├── providers.tsx         # Wagmi, RainbowKit, Query providers
│   ├── globals.css           # Global styles
│   ├── academy/              # Course catalog and lesson viewer
│   ├── academy-gateway/      # Authentication gate for the academy
│   ├── admin/                # Internal admin dashboard
│   ├── api/                  # API routes (campaigns, users, rewards, etc.)
│   ├── chat/                 # Embedded chat interface
│   ├── partner-console/      # Partner dashboard for campaign management
│   ├── partner-portal/       # Partner landing & onboarding page
│   └── points/               # Points and leaderboard view
├── components/
│   ├── ui/                   # shadcn/ui base components
│   ├── NavBar.tsx            # Top navigation bar
│   ├── Footer.tsx            # Page footer
│   ├── Layout.tsx            # Page layout wrapper
│   ├── CourseCard.tsx        # Campaign/course card UI
│   ├── CoursesSection.tsx    # Campaign listing section
│   ├── FaqSection.tsx        # FAQ accordion
│   ├── VideoPlayer.tsx       # SCORM/video lesson player
│   ├── WalletModal.tsx       # Wallet connection modal
│   ├── connectButton.tsx     # Custom connect button
│   ├── Avatar.tsx            # User avatar component
│   └── ChatWidget.tsx        # AI chat assistant widget
├── hooks/                    # Custom React hooks
├── lib/
│   ├── auth.ts               # NextAuth configuration
│   ├── campaign-modules.ts   # Campaign module logic
│   ├── campaign-rewards.ts   # Reward calculation helpers
│   ├── constants.ts          # Contract addresses, ABIs, chain config
│   ├── encryption.ts         # Encryption utilities
│   ├── points.ts             # Points system logic
│   ├── prisma.ts             # Prisma client singleton
│   ├── utils.ts              # General utility functions
│   ├── contracts/            # Typed contract interaction helpers
│   ├── merkle/               # Merkle proof generation
│   ├── middleware/           # Auth and rate-limiting middleware
│   ├── scorm/                # SCORM parser and progress tracker
│   └── services/             # External service integrations (IPFS, analytics, etc.)
├── plugins/                  # Next.js and Webpack plugins
├── prisma/                   # Prisma schema and migrations
├── scripts/                  # Utility scripts (seed data, migration runners)
├── next.config.js            # Next.js configuration
├── tailwind.config.js        # Tailwind CSS theme
├── tsconfig.json             # TypeScript configuration
└── package.json              # Dependencies and scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL database

### Install

```bash
cd webapp
npm install
```

### Environment Variables

Copy `.env` (or create from scratch) and configure:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/nexacademy

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret

# Blockchain
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
RELAYER_PRIVATE_KEY=your_relayer_wallet_private_key

# IPFS (Pinata)
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret

# Encryption
ENCRYPTION_KEY=your_encryption_key
```

See `.env` in this directory for the full list of supported variables.

### Database Setup

```bash
# Push schema to your database
npx prisma db push

# Or run migrations
npx prisma migrate deploy

# Open Prisma Studio (visual DB browser)
npx prisma studio
```

### Development

```bash
# Start dev server (http://localhost:3000)
npm run dev
```

### Production

```bash
# Build
npm run build

# Start production server
node server.js
```

## App Routes

| Route | Description |
|---|---|
| `/` | Public home page with live campaign preview |
| `/academy` | Campaign catalog (requires auth) |
| `/academy-gateway` | Wallet sign-in gate |
| `/academy/campaign/[id]` | Campaign detail + lesson viewer |
| `/admin` | Internal admin panel |
| `/partner-portal` | Partner onboarding landing |
| `/partner-console` | Partner dashboard for managing campaigns |
| `/points` | Leaderboard and user points tracker |
| `/chat` | AI chat assistant |

## API Routes (`app/api/`)

The backend exposes API routes for:
- Campaign CRUD operations
- Module and lesson management
- User enrollment and progress tracking
- On-chain task verification
- Reward claim processing (with Merkle proofs)
- Partner management

## License

MIT
