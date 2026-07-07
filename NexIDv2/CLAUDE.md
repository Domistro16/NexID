# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`nexid-edgeboard` is the NexMarkets application: a Next.js 16 / React 19 app that turns a belief ("thesis") into a tradable market. `.id` (NexDomains) is the identity passport for trading, launching, receipts, referrals, and rewards; **EdgeBoard** is the public reputation/rewards layer. Contracts are a first-class track and use **Hardhat, not Foundry**.

`docs/NexMarkets_Implementation_Plan.md` is the source of engineering truth for the product direction; the `.html` bibles in `docs/` are source material, not runtime UI.

### The three market origins (core domain model)

Every market has a `MarketOrigin`:
- **Polymarket route** — an equivalent market already exists; order flow is routed through Polymarket CLOB APIs.
- **Native NexMarket** — no clean match and the thesis is allowed; a `.id`-eligible creator launches an on-chain Base market with USDC collateral and a launch stake. Requires `.id` eligibility.
- **Draft/prelaunch** — offchain record only, no funds.

Non-negotiable rules: native creation requires `.id`; launch stake is only for native creation (never for trading routes); unsafe markets are blocked; duplicates are blocked or routed; ambiguous markets are refined before launch.

## Commands

```bash
npm run dev                 # Next.js app (port 3000)
npm run build               # prisma generate + next build
npm run lint                # next lint

# Reviewer app (separate workspace @nexid/reviewer under apps/reviewer)
npm run dev:reviewer
npm run build:reviewer

# Database (Prisma 7, Postgres via @prisma/adapter-pg)
npm run db:generate         # prisma generate
npm run db:migrate          # prisma migrate deploy
npm run db:studio

# App/integration tests (node:test, .mjs, no framework)
npm run test:proofflow      # node --test test/proofflow/*.test.mjs
npm run test:agent-launch
node --test test/proofflow/proofflow-policy.test.mjs   # run a single test file

# QA smoke against a running app
npm run qa:smoke

# Contracts (Hardhat)
npm run contracts:compile
npm run contracts:test
npm run contracts:invariants        # native-market invariant suite
npx hardhat test test/contracts/native-market.ts   # single contract test
npm run contracts:slither           # requires python slither

# Launch-agent CLI (talks to the running app's /v1 API)
npm run nex -- agents whoami        # needs NEXMARKETS_AGENT_KEY + NEXMARKETS_API_URL
```

Networks: `baseSepolia` (84532), `base` mainnet (8453), local `hardhat` (31337). Deploy/ops scripts are enumerated as `contracts:*` and `safe:*` npm scripts (see `package.json`) and live in `scripts/contracts/`.

## Architecture

### Layering
- **`app/`** — Next.js App Router. Pages are top-level segments (`market`, `markets`, `launch`, `mint`, `passport`, `proofflow`, `provers`, `points`, `edgeboard`, `internal`, `v1`, …). **`app/api/`** holds route handlers; **`app/v1/` + `app/api/v1/`** are the external/agent-facing API. Route handlers stay thin and delegate to services.
- **`lib/services/`** — the bulk of the business logic. Route handlers and pages import service functions from here (e.g. `nexmarketsService`, `proofFlowService`, `pointsEngine`, `agentLaunchService`). Sub-namespaces: `lib/services/nexmind/` (thesis routing, drafting, trending, source monitoring, alerts), `lib/services/virtuals/` (Virtuals NexMind inference), `lib/services/bankr/` (agent auth, AI, rate limiting, x402 access).
- **`lib/server/`** — server-only primitives: `db.ts` (Prisma singleton + `withDatabase` fallback wrapper), `session.ts`, `internal-admin-auth.ts`, `validation.ts`, `agent-api-error.ts`.
- **`lib/contracts/` + `lib/wallet/` + `lib/client/`** — on-chain ABIs/addresses, wallet stack, and client-side helpers.
- **`components/`** — React components grouped by surface (`nexid`, `nexmarkets`, `seo`).
- **`contracts/`** — Solidity (`MarketFactory`, `NativeBinaryMarket`, `ResolutionManager`, `UmaResolutionManager`, `FeeRouter`, `EdgeRewardDistributor`, `LaunchStakeVault`, `TokenBuybackBurner`, `NexTokenDomainMinter`, `NativeTargetOrderExecutor`, `EmergencyGuard`). `typechain-types/` is generated.

### Database access pattern
`lib/server/db.ts` exposes a `prisma` singleton that is `undefined` when `DATABASE_URL` is unset. Use `withDatabase(fn, fallback)` — it runs `fn(prisma)` when a DB is configured and otherwise (or on error in non-production) returns `fallback()`. Many services are designed to degrade to static/fallback data without a database, so preserve that pattern rather than assuming `prisma` exists.

### Auth surfaces (three distinct systems)
- **User sessions** — cookie `nexid_session`, HMAC-hashed tokens (`lib/server/session.ts`), wallet-based.
- **Internal admin** — `proxy.ts` (Next middleware) gates `internal`/cron routes via `INTERNAL_ADMIN_TOKEN` / `CRON_SECRET` (header, query param, or cookie). Cron endpoints check a per-path secret.
- **Agents** — `NEXMARKETS_AGENT_KEY` bearer tokens tied to `AgentApiKey` → `AgentProfile` (durable public `.id`, reputation, badges). Agents are **launch-only**: search/draft/validate/preview/launch, never trade. See `docs/agent-launch.md`.

### On-chain resolution (ProofFlow)
Native market resolution runs through the ProofFlow system: prover pools, reviewer panels, evidence submissions, disputes, and settlement receipts (see the many `ProofFlow*` Prisma models and `lib/services/proofFlow*`). Off-chain resolution bots (`scripts/run-native-resolution-bot.mjs`, `run-native-target-orders.mjs`) drive the on-chain `ResolutionManager` / `NativeTargetOrderExecutor` and sync via `OnchainEventCursor` / `nativeMarketIndexerService`.

## Conventions

- Import alias `@/*` maps to repo root (e.g. `@/lib/services/...`).
- API route handlers typically set `export const dynamic = "force-dynamic"` and return `NextResponse.json`. Reads that can be cached set `Cache-Control` with `s-maxage`/`stale-while-revalidate`.
- App/integration tests are plain `node:test` `.mjs` files (no Jest/Vitest); contract tests are `.ts` under `test/contracts/` run by Hardhat. `test/` and `scripts/contracts/` are excluded from the app `tsconfig`.
- TypeScript is `strict`. Validation uses `zod`.

## Frontend design rules (from AGENTS.md)

`AGENTS.md` mandates a distinctive, non-generic aesthetic. **Never use Inter** or generic SaaS layouts. Every UI must establish a typography identity, motion identity, atmospheric background, and distinctive color language. Prefer cinematic/editorial composition. Generic "AI-slop" frontend output is treated as failure.
