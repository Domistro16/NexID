# NexMarkets Implementation Plan

## 1. Purpose

This file is the implementation plan for upgrading the current NexID app into NexMarkets, based on `docs/NexMarkets_Complete_Strategy_Bible_Readable.html`.

NexMarkets is the route-and-launch layer for tradable narratives:

- If a matching market already exists, NexMarkets routes users to the existing Polymarket market.
- If no clean market exists and the thesis is allowed, eligible `.id` creators can launch a native NexMarket.
- `.id` becomes the identity passport for trading, launching, receipts, referrals, creator reputation, and rewards.
- EdgeBoard becomes the public reputation and rewards layer for traders, creators, and referrers.

This plan treats contracts as a first-class implementation track. Native markets must use Hardhat, not Foundry.

## 2. Current App Baseline

The current app already contains several pieces that should be preserved and upgraded:

- Next.js, React, TypeScript, Tailwind CSS, Prisma, Postgres.
- RainbowKit, Wagmi, and Viem wallet stack.
- NexDomains `.id` pricing and mint integration.
- Referral code capture and mint referral passing.
- Polymarket credential and open-position sync scripts.
- Receipt, points, reward, and EdgeBoard services.
- Admin surfaces for users, rewards, analytics, and system operations.
- Dashboard and passport-like user surfaces.

The upgrade should not restart the product from scratch. It should expand the current system into NexMarkets while preserving the work already built.

## 3. Canonical Product Direction

### 3.1 Product Thesis

NexMarkets lets users turn belief into a market.

The product loop is:

1. User sees or enters a thesis.
2. NexMarkets shapes the thesis into a precise market.
3. The system checks whether the market already exists.
4. If it exists, user trades the routed market.
5. If it does not exist and is allowed, an eligible `.id` creator launches a native market.
6. User trades Ride or Fade.
7. The position becomes a receipt.
8. Receipts and performance feed the EdgeBoard, badges, rewards, and public passport.

### 3.2 Market Origins

NexMarkets supports three market origins:

| Origin | When Used | User Sees | System Behavior |
| --- | --- | --- | --- |
| Polymarket route | Equivalent existing market exists | NexMarkets market room with Ride/Fade copy | Route order flow through Polymarket APIs where allowed |
| Native NexMarket | No clean existing match and market is allowed | Creator-launched market with `.id`, launch stake, and rules | Base smart contracts using USDC collateral |
| Draft/prelaunch | Contracts disabled, market ambiguous, or user saves idea | Draft market with watch/share/refine flow | Offchain record only, no funds |

### 3.3 Non-Negotiable Product Rules

- Native market creation requires `.id` eligibility.
- Launch stake is only for native market creation, never for trading existing Polymarket routes.
- Unsafe markets are blocked.
- Ambiguous markets are refined before launch.
- Duplicate markets are blocked or routed to the existing market.
- Low volume alone is not an invalid market condition.
- Native markets must not launch uncapped real-money volume before staged testnet, capped canary, monitoring, and review.

## 4. Implementation Phases

## Phase 0: Canon Alignment And Technical Grounding

### Goal

Create the implementation foundation before any large product rewrite.

### Required Work

- Keep this implementation file as the current source of engineering truth.
- Treat the strategy HTML as source material, not runtime UI.
- Confirm all current app routes, services, Prisma models, and admin flows.
- Confirm the existing `.id` integration points with NexDomains.
- Confirm all Polymarket environment variables, credential scripts, and currently working APIs.
- Confirm the current EdgeBoard and rewards implementation.
- Confirm current wallet auth uses RainbowKit/Wagmi and remove any remaining MetaMask-only assumptions.
- Define feature flags for native market readiness:
  - `NATIVE_MARKETS_ENABLED`
  - `NATIVE_MARKETS_TESTNET_ONLY`
  - `NATIVE_MARKETS_CANARY_MODE`
  - `POLYMARKET_ROUTING_ENABLED`
  - `MARKET_COMPOSER_ENABLED`

### Acceptance Criteria

- The repo has a written NexMarkets implementation plan.
- The app still builds after plan/doc changes.
- No old template HTML is edited for runtime behavior.
- Any product change references the new NexMarkets plan, not scattered assumptions.

## Phase 1: Route-Only NexMarkets MVP

### Goal

Ship NexMarkets as a route-only market product before native custody risk.

### Product Behavior

- Users can browse markets by narrative, arena, and status.
- Users can search or enter a thesis.
- The system checks for matching Polymarket markets.
- Existing markets are displayed in NexMarkets language but preserve the underlying Polymarket settlement reality.
- Users can trade routed markets where the Polymarket integration supports it.
- If no clean market exists, users can save or share a draft instead of launching a native market.
- `.id` is shown as the user passport, with primary domain fallback where needed.
- Receipts and EdgeBoard continue to work from routed activity.

### Frontend Routes

Implement or upgrade these routes:

- `/pulse`
  - Main market discovery feed.
  - Shows live routed markets, draftable theses, and user momentum.
  - Uses strong editorial layout, not generic SaaS cards.

- `/launch`
  - Thesis Studio.
  - Lets user enter a market idea.
  - Shows shaped title, arena, rules, settlement source, duplicate state, and route result.
  - In Phase 1, native launch CTA is disabled or draft-only.

- `/market/[id]`
  - Unified market room.
  - Supports Polymarket route view first.
  - Shows actual settlement question and source clearly.
  - Shows Ride/Fade UI as NexMarkets presentation, not a replacement for real settlement rules.

- `/edgeboard`
  - Public board for points, rewards, volume, winnings, creator status, and referral performance.
  - Must not display hardcoded names, addresses, mock leaders, or placeholder activity.

- `/passport`
  - User identity, `.id`, primary domain fallback, wallet, referrals, receipts, rewards, and badge state.

- `/id/[name]`
  - Public profile for `.id` identities.
  - Shows creator history, trader history, receipts, rewards, and referral status when available.

- `/my-edge`
  - Private user view for positions, receipts, rewards, referrals, and badge progress.

### Backend Services

Add or upgrade these service boundaries:

- `MarketSyncService`
  - Pulls and caches Polymarket market metadata.
  - Stores enough normalized data for matching and display.

- `RouteMatcherService`
  - Checks exact Polymarket matches.
  - Checks related-but-not-equivalent matches.
  - Checks native duplicates once native markets exist.
  - Returns a deterministic route decision.

- `MarketComposerService`
  - Shapes raw user thesis into structured market draft.
  - Produces arena, entities, metric, timeframe, settlement source, title, and risk state.
  - Uses structured JSON outputs when AI is enabled.

- `ReceiptService`
  - Creates proof records for calls/trades.
  - Later supports share image generation.

- `EdgeBoardService`
  - Calculates points, ranks, exclusions, and reward eligibility.
  - Must exclude suspicious/self-trade activity from rewards when flagged.

- `PassportService`
  - Resolves display identity in this order:
    1. reserved `.id`
    2. primary domain
    3. shortened wallet
  - Provides identity data to dashboards, receipts, markets, referrals, and admin.

### Database Additions

Add or adapt models for route-only markets:

- `Market`
  - `id`
  - `origin`
  - `status`
  - `title`
  - `question`
  - `arena`
  - `template`
  - `sourceUrl`
  - `closeTime`
  - `polymarketMarketId`
  - `polymarketConditionId`
  - `polymarketClobTokenIds`
  - `creatorUserId`
  - `createdAt`
  - `updatedAt`

- `MarketDraft`
  - raw thesis and shaped draft JSON.
  - route decision JSON.
  - risk status.
  - user/session attribution.

- `MarketRouteMatch`
  - matched Polymarket/native market.
  - match type: exact, related, weak, none.
  - confidence and reason.

### API Routes

Implement or upgrade:

- `POST /api/shape-market`
- `POST /api/route-check`
- `GET /api/markets`
- `GET /api/markets/[id]`
- `POST /api/polymarket/orders`
- `POST /api/receipts`
- `GET /api/edgeboard`
- `POST /api/id/mint`
- `POST /api/alerts/connect-telegram`

### Acceptance Criteria

- User can open `/pulse`, see real database-backed market data or empty states.
- User can enter a thesis on `/launch`.
- Route check returns exact, related, blocked, ambiguous, or draftable state.
- No hardcoded market names, wallet addresses, leaderboard users, or mock prices are shown as real data.
- `.id` or primary domain appears anywhere user identity is required.
- Polymarket routed prices and market details come from APIs, not hardcoded values.

## Phase 2: Hardhat Native Market Testnet

### Goal

Build and test the native NexMarkets protocol on Base Sepolia using Hardhat.

Native contracts are not optional. They are the core of the new NexMarkets strategy after the route-only MVP.

### Hardhat Toolchain

Add the following workspace:

- `contracts/`
- `test/contracts/`
- `scripts/contracts/`
- `hardhat.config.ts`

Add dependencies:

- `hardhat`
- `@nomicfoundation/hardhat-toolbox`
- `@openzeppelin/contracts`
- `dotenv`

Use:

- Solidity `0.8.24`
- TypeScript Hardhat config
- Optimizer enabled
- Hardhat local network
- Base Sepolia testnet
- Base mainnet only after canary approval

Add scripts:

- `contracts:compile`
- `contracts:test`
- `contracts:deploy:base-sepolia`
- `contracts:deploy:base-mainnet`
- `contracts:verify`

Required environment variables:

- `BASE_SEPOLIA_RPC_URL`
- `BASE_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`
- `BASESCAN_API_KEY`
- `USDC_BASE_SEPOLIA`
- `USDC_BASE_MAINNET`
- `PROTOCOL_TREASURY_ADDRESS`
- `REWARDS_POOL_ADDRESS`
- `SECURITY_POOL_ADDRESS`
- `ID_REGISTRY_ADDRESS`
- `NATIVE_MARKET_FACTORY_ADDRESS`
- `NATIVE_FEE_ROUTER_ADDRESS`
- `NATIVE_RESOLUTION_MANAGER_ADDRESS`

### Contract Modules

#### `MarketFactory.sol`

Responsibilities:

- Create native binary markets.
- Require creator `.id` eligibility through `PassportRegistryAdapter`.
- Lock rules hash at launch.
- Store metadata hash.
- Collect launch stake through `LaunchStakeVault`.
- Prevent duplicate active rules hashes.
- Enforce template allowlist.
- Enforce cooldown before trading opens.
- Register created market addresses.
- Emit creation events for backend indexing.

Important checks:

- Reject duplicate active rules hash.
- Reject blocked templates.
- Reject creators without `.id` eligibility.
- Reject native launch when factory is paused.
- Reject malformed launch params.

#### `NativeBinaryMarket.sol`

Responsibilities:

- Manage Ride/Fade side accounting.
- Accept USDC collateral.
- Handle buy, sell, close, redeem, and refund paths.
- Apply native trading fee.
- Route fees through `FeeRouter`.
- Enforce early exposure caps.
- Enforce launch cooldown.
- Prevent creator same-transaction launch-and-trade behavior.
- Track market status for trading, closed, settled, invalid, and refunded states.

V1 implementation policy:

- Keep the market primitive binary.
- Keep collateral USDC-only.
- Keep settlement externalized through `ResolutionManager`.
- Keep curve math simple enough to audit.
- Do not support complex multi-outcome markets in v1.

#### `LaunchStakeVault.sol`

Responsibilities:

- Receive the `$20` launch stake.
- Split `$10` non-refundable launch fee from `$10` quality bond.
- Route launch fee:
  - `$5` protocol treasury
  - `$3` EdgeBoard/rewards pool
  - `$2` resolution/security pool
- Return quality bond when a market settles cleanly.
- Slash quality bond for invalid, spam, duplicate, malicious, or unsafe markets.
- Emit stake, fee, refund, and slash events.

#### `FeeRouter.sol`

Responsibilities:

- Split native trading fee.
- Native trading fee is `200 bps`.
- Fee split:
  - creator: `100 bps`
  - protocol treasury: `60 bps`
  - EdgeBoard/rewards pool: `20 bps`
  - resolution/security pool: `20 bps`
- Reject configurations where fee splits do not sum correctly.
- Emit fee distribution events.

#### `ResolutionManager.sol`

Responsibilities:

- Allow outcome proposal after close.
- Track proposer bond.
- Open dispute window.
- Track disputer bond.
- Finalize undisputed outcomes after dispute window.
- Mark disputed markets for oracle/adjudicator resolution.
- Support valid settlement, invalid refund, and cancelled-before-trading outcomes.
- Emit proposal, dispute, finalization, invalidation, and refund events.

V1 policy:

- Start with an admin/adjudicator-controlled testnet resolution path.
- Keep interface compatible with UMA Optimistic Oracle or another oracle adapter later.
- Do not pretend the app itself is the final judge for production markets.

#### `PassportRegistryAdapter.sol`

Responsibilities:

- Verify whether a wallet is eligible to create native markets.
- Read from deployed `.id` registry when available.
- Support testnet mock registry for Base Sepolia.
- Expose primary `.id` or eligibility status to the factory.

#### `EmergencyGuard.sol`

Responsibilities:

- Pause native market creation.
- Pause trading if needed.
- Enforce canary caps.
- Enforce template-level limits.
- Provide role-gated emergency controls.
- Emit all emergency actions.

#### `MockUSDC.sol`

Responsibilities:

- Support local and Base Sepolia testing.
- Use 6 decimals like USDC.
- Provide faucet/mint functionality only on test deployments.

### Contract Events Required For Indexing

Contracts must emit events for:

- market creation
- launch stake paid
- launch fee distributed
- quality bond returned
- quality bond slashed
- trade executed
- fees distributed
- market closed
- result proposed
- result disputed
- market settled
- market invalidated
- user redeemed
- market refunded
- emergency pause/unpause
- cap updates
- template allowlist updates

### Contract Test Plan

Use Hardhat tests only. Do not add Foundry.

Required test groups:

- Factory
  - creates market with valid `.id` creator
  - rejects creator without `.id`
  - rejects duplicate rules hash
  - rejects blocked template
  - rejects paused factory

- Launch stake
  - collects `$20`
  - routes `$10` launch fee correctly
  - stores `$10` quality bond
  - returns bond for clean settlement
  - slashes bond for invalid market

- Fees
  - applies 2% native trading fee
  - sends 1.00% to creator
  - sends 0.60% to protocol
  - sends 0.20% to rewards
  - sends 0.20% to security
  - rejects invalid fee configs

- Trading
  - buys Ride
  - buys Fade
  - sells where supported
  - prevents trading before cooldown ends
  - prevents creator same-transaction manipulation
  - enforces early exposure caps
  - never overpays collateral during redemption

- Resolution
  - closes market
  - proposes Ride win
  - proposes Fade win
  - finalizes undisputed result
  - opens dispute window
  - handles disputed market state
  - handles invalid refund

- Emergency
  - pause blocks creation
  - pause blocks trading
  - canary caps are enforced
  - role checks prevent unauthorized operations

### App Integration With Contracts

Backend:

- Add deployment registry table for contract addresses by chain.
- Add native market registry table keyed by market id and contract address.
- Add onchain event indexer.
- Do not trust frontend-submitted state for settlement, fee, or trade finality.
- Sync contract events into database and use indexed events for UI state.

Frontend:

- Use Wagmi/Viem for native market writes.
- Show clear testnet/mainnet network state.
- Disable native launch when wrong network or feature flag is off.
- Show transaction pending, confirmed, failed, and indexed states.
- Keep route-only draft behavior available when native contracts are disabled.

### Acceptance Criteria

- `npm run contracts:compile` succeeds.
- `npm run contracts:test` succeeds.
- Base Sepolia deployment script runs with configured env.
- MarketFactory deploys and creates a test market.
- Mock/test USDC launch stake and trade flow works.
- Backend can index emitted events into the database.
- Frontend can show a testnet native market from indexed state.

## Phase 3: Capped Base Mainnet Canary

### Goal

Enable real-money native markets with strict limits only after Phase 2 succeeds.

### Canary Controls

- Base mainnet only.
- USDC collateral only.
- Limited market templates.
- Limited creator allowlist or trust threshold.
- Daily market creation cap.
- Per-market volume cap.
- Per-wallet early exposure cap.
- Protocol-wide TVL cap.
- Pause controls enabled.
- Admin monitoring enabled.
- Public warnings for canary status.

### Required Admin Screens

- Contract deployment registry.
- Native market list.
- Market lifecycle monitor.
- Fee and pool balances.
- Launch stake status.
- Dispute queue.
- Emergency pause controls.
- Canary caps and usage.
- Event indexer health.

### Monitoring

Add alerts for:

- abnormal trading volume
- failed event indexing
- failed settlement
- repeated disputes
- unexpected contract balance changes
- cap approaching limit
- pause triggered
- high failed transaction rate

### Acceptance Criteria

- Only approved templates can launch.
- Caps are enforced onchain where possible.
- Emergency pause works.
- Admin can see all live native markets and lifecycle states.
- Public UI clearly distinguishes canary markets from route-only markets.

## Phase 4: Audit, Bug Bounty, And Expansion

### Goal

Prepare native markets for broader release.

### Security Work

- Run Hardhat coverage.
- Run Slither.
- Review all role controls.
- Review fee math and collateral accounting.
- Review settlement and invalid refund paths.
- Review dispute path.
- Review event-indexing assumptions.
- Commission independent review before uncapped production.

### Expansion Work

- Add more templates.
- Add creator campaign pages.
- Add richer public `.id` creator records.
- Add advanced EdgeBoard seasons.
- Add public API endpoints for markets, receipts, passports, and boards.
- Add Telegram alert flows.
- Add social receipt sharing.

### Acceptance Criteria

- No uncapped native market launch before independent review.
- Bug bounty or responsible disclosure process exists.
- Admin has operational runbooks.
- Contract deployment addresses and verification links are documented.

## Phase 5: Ecosystem And API Layer

### Goal

Turn NexMarkets into a developer, creator, and bot ecosystem.

### Work

- Public market feed API.
- Public passport API.
- Public receipt API.
- Public EdgeBoard API.
- Bot lane for builders.
- Webhook support for market events.
- Creator campaign tools.
- Telegram and social launch integrations.
- API key or paid tier support after traction.

### Acceptance Criteria

- External consumers can read market/passport/receipt data.
- API access does not expose private user data.
- Rate limits exist.
- Builder attribution and referral attribution are preserved.

## 5. Data Model Plan

### New Or Expanded Models

Add or adapt these Prisma models over the phases:

- `Market`
- `MarketDraft`
- `MarketRouteMatch`
- `NativeMarketRules`
- `NativeMarketDeployment`
- `LaunchStake`
- `NativePosition`
- `NativeTrade`
- `MarketResolution`
- `MarketDispute`
- `ContractDeployment`
- `OnchainEventCursor`
- `MarketReceipt`
- `CreatorFeeLedger`
- `RewardsPoolLedger`
- `MarketTemplate`

### Required Market Fields

Every market record should support:

- market origin: `polymarket`, `native`, or `draft`
- status
- title
- question
- arena
- template
- settlement source
- close time
- creator user id
- creator wallet
- creator display identity
- Polymarket ids when routed
- chain id when native
- contract address when native
- rules hash when native
- metadata hash when native
- launch stake status when native
- resolution state
- created and updated timestamps

### Lifecycle State Machine

Use these states:

- `draft`
- `route_check`
- `ready_to_launch`
- `live_pending_open`
- `trading_live`
- `closed`
- `result_proposed`
- `disputed`
- `settled`
- `invalid_refund`
- `cancelled_before_trading`

State transitions must be explicit and validated. Native market final state must be reconciled from contract events.

## 6. API Contract Plan

### `POST /api/shape-market`

Input:

- raw thesis
- arena hint
- user locale
- optional creator/user context

Output:

- title
- question
- arena
- template
- entities
- timeframe
- settlement source
- risk status
- missing fields
- blocked reason when blocked

### `POST /api/route-check`

Input:

- shaped draft
- optional user id

Output:

- route status: exact, related, weak, none, blocked, ambiguous
- Polymarket candidates
- native candidates
- recommended action
- duplicate reason

### `POST /api/native-markets`

Input:

- shaped market draft id
- creator wallet
- rules hash
- metadata hash
- selected template
- chain id

Output:

- app market id
- transaction request or submitted tx hash
- pending indexed state

Rules:

- Must require authenticated wallet.
- Must require `.id` eligibility.
- Must require native feature flag.
- Must block launch if route check finds an exact existing market.

### `POST /api/native-markets/[id]/trade`

Input:

- side: Ride or Fade
- amount
- slippage limit
- wallet
- chain id

Output:

- transaction request or submitted tx hash
- expected fee split
- expected price impact

Rules:

- Must not use hardcoded pricing.
- Must read from contract/app state.
- Must respect paused/capped/closed market state.

### `POST /api/polymarket/orders`

Rules:

- Route only valid Polymarket market/order data.
- Preserve builder attribution where supported.
- Verify live Polymarket API behavior before production.
- Do not alter settlement meaning.

## 7. Frontend Architecture Plan

### Component Organization

Do not use one monolithic template component for the whole app.

Use feature-scoped components:

- `components/pulse/*`
- `components/launch/*`
- `components/markets/*`
- `components/passport/*`
- `components/edgeboard/*`
- `components/admin/*`
- `components/shared/*`

Pages should own page composition. Shared components should be reusable but not become a single imported full-page template.

### Visual Direction

Follow `AGENTS.md`:

- Never use Inter.
- Avoid generic SaaS layout patterns.
- Establish typography identity.
- Establish motion identity.
- Establish atmospheric background system.
- Establish distinctive color language.
- Prefer cinematic and editorial composition.
- Avoid AI-slop aesthetics.

### UI Quality Rules

- No text overlapping buttons.
- No joined labels where text should wrap to the next line.
- Capitalize visible labels correctly.
- Preserve the template's intended navbar feel while adapting it into Next.js.
- Buttons must not render over body copy.
- Long wallet/domain strings must truncate cleanly.
- Empty states must be honest and not show fake users.
- If there is no leaderboard user with more than 0 points, do not show a fake leader.
- Dashboard and EdgeBoard must never display mock identities as real activity.

## 8. Rewards, Fees, And EdgeBoard

### Revenue Sources

- Polymarket builder fees where supported.
- Native launch fees.
- Native protocol trading fees.
- `.id` mints.
- Future API/bot access.

### Native Launch Fee

Native launch stake:

- `$20` total
- `$10` non-refundable launch fee
- `$10` refundable quality bond

Launch fee split:

- `$5` protocol treasury
- `$3` EdgeBoard/rewards pool
- `$2` resolution/security pool

### Native Trading Fee

Native trading fee:

- `2%` total

Split:

- `1.00%` creator
- `0.60%` protocol treasury
- `0.20%` EdgeBoard/rewards pool
- `0.20%` resolution/security pool

### EdgeBoard Points

Points can come from:

- valid market launches
- clean market settlement
- correct calls
- early correct calls
- trading volume
- winnings
- referral `.id` mints
- receipt quality and share activity where appropriate

Points must exclude:

- suspicious self-trading
- wash volume
- invalid markets
- duplicate launches
- admin-flagged abuse

Rewards should be distributed from real revenue pools. Avoid promising future token airdrops as the core motivator.

## 9. Admin And Operations

### Admin Capabilities

Admin should support:

- user lookup
- wallet and `.id` lookup
- market review
- draft/risk review
- route match review
- native market monitor
- contract deployment registry
- fee ledger
- reward season management
- referral review
- dispute queue
- launch stake status
- emergency pause
- audit logs

### Admin UX

Admin should abstract nonessential noise:

- Show summaries first.
- Put raw JSON and low-level event data behind details views.
- Highlight actions needed.
- Show operational health clearly.
- Avoid overwhelming tables where a status card plus focused table is better.

## 10. Security And Compliance Guardrails

### Product Safety

- Do not launch uncapped native real-money markets without independent review.
- Keep route-only and draft modes available when native launch is disabled.
- Block unsafe market categories.
- Refine ambiguous markets.
- Make settlement sources visible.
- Make invalid/refund rules visible.
- Avoid copy that implies guaranteed profit.

### Contract Safety

- Use OpenZeppelin access control and pausable primitives.
- Keep role ownership clear.
- Emit events for all critical actions.
- Avoid upgradeability unless there is a clear reason and documented admin risk.
- Keep v1 binary-only.
- Keep collateral USDC-only.
- Keep fee math simple and test-covered.
- Keep native markets capped until reviewed.

### Operational Safety

- Monitor contract balances.
- Monitor failed indexing.
- Monitor high dispute rates.
- Monitor abnormal volume.
- Monitor failed settlements.
- Maintain pause runbooks.

## 11. Testing Matrix

### App Tests

- Market route check exact match.
- Market route check related match.
- Market route check weak match.
- Market route check no match.
- Blocked market shaping.
- Ambiguous market shaping.
- Draft market save.
- Polymarket market room display.
- `.id` display fallback to primary domain.
- Wallet fallback truncation.
- Referral capture and mint forwarding.
- EdgeBoard empty state.
- EdgeBoard real-data ranking.
- Admin market review.
- Admin reward season review.

### Contract Tests

Use Hardhat:

- factory creation
- duplicate prevention
- `.id` eligibility
- launch stake collection
- fee distribution
- trading before/after cooldown
- creator manipulation guard
- exposure caps
- close/propose/dispute/finalize
- invalid/refund
- redeem accounting
- pause controls
- canary caps

### Integration Tests

- Native market created on Base Sepolia.
- Event indexer records market creation.
- Frontend displays indexed native market.
- User executes test trade.
- Fee event indexes correctly.
- Market closes and resolves.
- User redeems.
- Receipt appears.
- EdgeBoard updates from real indexed data.

### Build And Verification

Required checks before merge:

- `npm run build`
- `npm run contracts:compile`
- `npm run contracts:test`

Required before Base Sepolia deployment:

- env vars present
- deployer wallet funded
- USDC/mock USDC configured
- deployment registry updated
- Basescan verification configured

## 12. Rollout Checklist

### Before Route-Only MVP

- No hardcoded mock user data.
- No hardcoded market prices.
- No direct template HTML rendering.
- Real empty states.
- Polymarket route checks working.
- `.id` and primary domain display working.
- Referrals working.
- Receipts working.
- EdgeBoard working from real data.

### Before Base Sepolia Native Markets

- Hardhat workspace added.
- Contracts implemented.
- Contract tests passing.
- Test USDC configured.
- Event indexer implemented.
- Native market feature flag enabled only for testnet.
- Admin can inspect native state.

### Before Base Mainnet Canary

- Base Sepolia test flow complete.
- Caps implemented.
- Emergency pause implemented.
- Admin monitoring implemented.
- Deployment addresses documented.
- Team runbook exists.
- Public UI labels canary risk clearly.

### Before Expanded Launch

- Independent security review completed.
- Slither issues reviewed.
- Bug bounty or disclosure process live.
- Monitoring stable.
- Incident response process ready.

## 13. Implementation Order

### First Implementation

Complete the route-only NexMarkets product layer:

1. Market data and route matching.
2. Thesis Studio draft flow.
3. `/pulse`, `/launch`, `/market/[id]`, `/passport`, `/edgeboard`, `/my-edge`.
4. No mock/hardcoded data.
5. `.id` and primary domain identity display everywhere.
6. Polymarket pricing and market data from real APIs.

### Second Implementation

Build the Hardhat native market protocol:

1. Hardhat setup.
2. Contract modules.
3. Contract tests.
4. Base Sepolia deploy script.
5. Deployment registry.
6. Event indexing foundation.

### Third Implementation

Connect native testnet markets into the app:

1. Native launch from `/launch`.
2. Native market room.
3. Wagmi/Viem transaction flows.
4. Test USDC flow.
5. Indexed trade/resolution state.
6. Admin native market monitor.

### Final Implementation

Prepare controlled production rollout:

1. Base mainnet canary deployment.
2. Caps and emergency controls.
3. Monitoring.
4. Audit/readiness work.
5. Expanded templates.
6. API/bot ecosystem.

## 14. Explicit Decisions

- Use Hardhat instead of Foundry.
- Use Base as the native chain.
- Use USDC as native collateral.
- Use binary Ride/Fade markets in v1.
- Use Polymarket routes before native launch where exact markets exist.
- Use `.id` as creator eligibility and public identity.
- Use primary domain fallback where `.id` is missing.
- Keep native markets disabled until contracts, tests, indexing, and admin controls exist.
- Do not edit the provided HTML template as if it is runtime UI.
- Do not render the template HTML directly in the Next.js app.
- Implement frontend as proper Next.js pages and scoped components.

