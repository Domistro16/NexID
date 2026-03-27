# Partner Campaign Pricing And Rewards Implementation Plan

## Purpose

This document captures the implementation plan to align the contracts, backend, and webapp with the actual partner pricing model and reward distribution rules.

The current repo is not fully aligned yet:

- `contracts/PartnerCampaigns.sol` models partner campaigns as generic points-based campaigns.
- `contracts/CampaignEscrow.sol` currently distributes rewards proportionally by points.
- `webapp/app/partner-portal/page.tsx` already markets fixed partner plans with plan-specific winner caps and durations.

The goal is to make the pricing model the canonical source of truth across:

- contracts
- Prisma schema
- partner request flow
- admin approval flow
- on-chain campaign creation
- payout finalization and claims
- partner-facing UI

## Canonical Plan Model

We should introduce a single canonical campaign plan model used everywhere.

### Plan Types

- `LAUNCH_SPRINT`
- `DEEP_DIVE`
- `CUSTOM`

### Plan Rules

#### Launch Sprint

- Production fee: `$3,500`
- Minimum reward pool: `$5,000`
- Duration: `7 days`
- Maximum winners: `150`
- Campaign auto-ends after one week
- Single leaderboard

#### Deep Dive

- Production fee: `$8,500`
- Minimum reward pool: `$15,000`
- Duration: `30 days`
- Maximum winners: `500`
- Campaign auto-ends after one month
- Single leaderboard

#### Custom

- Production fee: custom
- Minimum reward pool: `$30,000`
- Duration: `180 days`
- Winner cap: custom
- Rolling leaderboard
- Requires explicit config during approval

## Reward Distribution Rules

The payout curve should be deterministic and shared across backend and contract settlement logic.

### Fixed Distribution Curve

- Rank 1: `15%`
- Rank 2: `10%`
- Rank 3: `5%`
- Ranks 4-10: split `10%` equally
- Remaining reward pool: split equally from rank 11 down to the winner cap

### Notes

- This model is incompatible with the current proportional-by-points escrow claim design.
- We should not try to patch the current `reward = userPoints / totalPoints * pool` approach.
- Rewards must be computed from finalized ranks, not proportional points.

## Architectural Direction

## 1. Contracts

### PartnerCampaigns Contract

Refactor `contracts/PartnerCampaigns.sol` so partner campaigns carry plan-specific metadata on-chain.

Add or derive fields such as:

- `planType`
- `winnerCap`
- `leaderboardMode`
- `startTime`
- `endTime`
- `isRolling`
- `rewardPool`

The contract should continue to store the campaign lifecycle and points, but it should not be the component that tries to compute the full ranked payout curve on-chain from scratch.

### Escrow Contract

Refactor `contracts/CampaignEscrow.sol` away from proportional claims.

Recommended direction:

- escrow still holds USDC
- backend finalizes winners and exact allocations
- contract stores finalized payout state for a campaign or payout round
- users claim their exact allocation

This can be implemented using one of these patterns:

- stored allocations on-chain
- Merkle root based claim verification
- round-based finalized allocations for rolling leaderboards

Recommended approach: Merkle-root or finalized-allocation claim model.

Reason:

- supports fixed top-heavy payouts
- supports winner caps cleanly
- supports multiple rounds for rolling leaderboards
- avoids expensive on-chain sorting

### Contract Rules To Enforce

- Launch Sprint and Deep Dive must auto-expire based on plan duration
- Custom must support rolling or periodic payout rounds
- Winner cap must be enforced at payout-finalization level
- Claims must only be possible for finalized winners
- Sponsors or admin can only withdraw residual funds after claim window or round close

## 2. Database And Schema

Update Prisma models in `webapp/prisma/schema.prisma`.

### Campaign

Add plan-related fields:

- `planType`
- `productionFeeUsd`
- `winnerCap`
- `leaderboardMode`
- `rewardDistributionModel`
- `isRolling`
- `rollingWindowDays` or `roundCadenceDays` for custom
- `payoutRoundCount` if needed
- `fundingStatus`

### CampaignRequest

Add request-time plan fields:

- `planType`
- `requestedWinnerCap` for custom
- `requestedDurationDays` if custom needs this configurable
- `requestedRewardPoolUsdc`
- `productionFeeUsd`
- optional custom plan notes

### Reward Distribution Tracking

Extend persistence for finalized payouts:

- payout round identifier
- finalized at timestamp
- finalized Merkle root or allocation batch reference
- winner count
- total allocated

If rolling leaderboards are implemented, payout state must support multiple rounds per campaign.

## 3. Shared Reward Allocation Service

Create one backend allocation module that is the only source of truth for payout math.

This service should:

- accept ranked leaderboard entries
- accept plan metadata
- enforce winner cap
- compute exact reward amounts
- handle rounding deterministically
- persist results to `CampaignParticipant.rewardAmountUsdc` or a round-specific table
- prepare inputs needed for on-chain payout finalization

### Rounding Policy

This needs one deterministic policy. Recommended:

- calculate all payouts in USDC base units
- distribute rounding dust to rank 1 or the last eligible winner

This same logic must be used in:

- admin preview
- payout approval
- contract finalization payload generation
- partner payout history display

## 4. Partner Request And Admin Approval Flow

### Partner Request Flow

Update the partner request flow so plan selection is explicit and validated.

Plan selection should drive:

- minimum reward pool validation
- default duration
- default winner cap
- rolling leaderboard behavior

Custom plan should allow:

- custom winner cap
- possibly custom payout round cadence
- additional review notes before approval

### Admin Approval Flow

Update `webapp/app/api/admin/campaign-requests/[id]/route.ts` so campaign creation is derived from plan rules instead of free-form values.

Approval should:

- map request plan to canonical plan config
- set `startAt` and `endAt`
- set `winnerCap`
- set `leaderboardMode`
- set `isRolling`
- set production fee metadata
- set contract creation params correctly

For fixed plans:

- Launch Sprint: end at `start + 7 days`
- Deep Dive: end at `start + 30 days`

For custom:

- end at `start + 180 days` unless custom approval rules allow override
- enable rolling leaderboard mode

## 5. On-Chain Creation And Funding Flow

Update the admin contract hook and related ABI usage in:

- `webapp/hooks/useAdminContract.ts`
- contract ABIs in `webapp/lib/contracts`

### Required Changes

- partner campaign creation params need to include plan-aware fields
- escrow creation must align with fixed duration and payout mode
- automatic funding flow must fund the reward pool at creation time

### Funding Model

Per your note, NexID funds the campaign upon creation after the partner has supplied the reward pool.

That means the system should support:

- admin-side escrow creation
- admin-side funding transaction
- DB funding status updates

We should decide whether the sponsor wallet still needs direct funding ability or whether all funding must go through the NexID treasury/admin wallet.

## 6. Rolling Leaderboard Model For Custom

Custom needs a concrete operational definition before implementation.

We need to choose one:

- monthly payout rounds
- fixed cadence payout windows
- one long rolling leaderboard with only final payout

Recommended approach:

- rolling campaign stays active for 6 months
- leaderboard is continuous
- payouts finalize on fixed rounds, for example monthly
- each round has its own finalized winners and claim state

This is the cleanest way to support the "rolling leaderboard" requirement without losing auditability.

## 7. Webapp Changes

### Partner Portal

Update `webapp/app/partner-portal/page.tsx` so the pricing copy is backed by the canonical plan model, not only hardcoded marketing copy.

### Partner Console

Update `webapp/app/partner-console/page.tsx` so it displays:

- plan type
- duration
- winner cap
- payout curve summary
- rolling status for custom
- funding status

The new campaign brief modal should capture:

- selected plan
- reward pool
- custom winner cap if plan is custom
- custom plan notes if needed

### Admin UI

Update admin campaign approval and builder flows so they preview:

- plan-derived duration
- plan-derived winner cap
- payout curve
- funding amount
- rolling or single payout mode

## 8. Migration And Backfill

Existing data already uses old concepts like:

- `STANDARD`
- `PREMIUM`
- `ECOSYSTEM`

We need a migration strategy.

### Recommended Mapping

- `STANDARD` -> `LAUNCH_SPRINT`
- `PREMIUM` -> `DEEP_DIVE`
- `ECOSYSTEM` -> `CUSTOM`

This mapping is acceptable only if it matches existing business usage.

We should also backfill:

- `winnerCap`
- `planType`
- `leaderboardMode`
- `isRolling`

for existing campaigns and requests.

## 9. Testing Plan

### Contract Tests

Add tests for:

- plan-based campaign creation
- auto-ending behavior
- funding flow
- fixed payout allocation finalization
- claim restrictions for non-winners
- winner-cap enforcement
- custom rolling-round payout flow
- residual withdrawal timing

### Backend Tests

Add tests for:

- plan validation
- min reward pool validation
- winner cap derivation
- fixed payout curve math
- rounding behavior
- admin approval pipeline
- funding status transitions

### End-To-End Flow

Validate full staging flow:

1. partner submits request
2. admin approves
3. campaign created in DB
4. campaign created on-chain
5. escrow created and funded
6. leaderboard accumulates
7. payout round finalized
8. winners claim

## Recommended Implementation Order

## Phase 1: Canonical Model And Backend

- add new plan enum and config
- update schema
- build shared reward allocation service
- update partner request validation
- update admin approval flow

## Phase 2: Contracts

- refactor `PartnerCampaigns.sol`
- replace proportional claim model in `CampaignEscrow.sol`
- update deployment scripts
- update contract tests

## Phase 3: Webapp Integration

- update partner portal
- update partner console
- update admin builder and approval UI
- update contract hooks and ABIs

## Phase 4: Migration And Verification

- backfill existing data
- run staging flow
- verify payout math and claim behavior

## Decisions Needed Before Implementation

These need confirmation before code changes start:

1. Is the Custom minimum reward pool `$30,000 total` or `$30,000 per month`?
   The current portal copy says `$30,000 min pool / month`.

2. For the 6-month rolling leaderboard, should payouts happen:
   - monthly
   - on a custom cadence
   - only once at the end

3. For Custom, does the same payout curve always apply, or can the payout curve be custom too?

4. What is the exact rule for custom winner cap?
   Recommended: require admin-set integer cap during approval.

5. How should rounding dust be handled?
   Recommended: deterministic assignment to rank 1 or last eligible winner.

6. Should only NexID/admin fund the escrow, or should sponsor wallets still be able to fund directly?

7. Should auto-ending be enforced both:
   - in the contract
   - and in backend/UI status derivation

## Recommendation

Do not try to retrofit the current proportional escrow model.

The correct direction is:

- plan-aware campaign metadata
- backend-finalized ranked allocations
- contract claim logic based on finalized winner allocations

That gives us:

- exact support for your pricing model
- deterministic payouts
- clean winner-cap enforcement
- support for rolling leaderboard rounds
- contract and webapp alignment
