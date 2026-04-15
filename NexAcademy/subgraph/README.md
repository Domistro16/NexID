# NexAcademy Subgraph

Indexes `PointsAwarded` events from the `PartnerCampaigns` contract and maintains:

- `UserCampaign` — per-user, per-campaign running points total
- `UserTotal`    — global leaderboard (sum across all campaigns per user)
- `CampaignTotal` — per-campaign aggregate (total points + participant count)

Mapping is fully incremental. Each event carries the authoritative running total; the handler computes `delta = totalPoints - previousPoints` and accumulates it into global / campaign totals. Delta is clamped to zero so reorgs or duplicate events cannot produce negative totals.

## Configure

Two `PartnerCampaigns` deployments (v1 + v2) are indexed as separate dataSources but share one handler and one set of entities. `campaignId` restarts at 0 per deployment, so `UserCampaign` and `CampaignTotal` IDs are namespaced by contract address. `UserTotal` is keyed only by user, so the global leaderboard sums points across both versions.

Fill both addresses and start blocks in [subgraph.yaml](./subgraph.yaml):

```yaml
- name: PartnerCampaignsV2
  source:
    address: "0xV2_ADDRESS"
    startBlock: <v2 deploy block>
- name: PartnerCampaignsV1
  source:
    address: "0xV1_ADDRESS"
    startBlock: <v1 deploy block>
```

Network defaults to `base`. Change if deploying against a different chain.

## Install

```bash
cd subgraph
npm install
```

## Codegen & build

```bash
npm run codegen
npm run build
```

## Deploy (Goldsky)

```bash
npm install -g @goldskycommand/cli      # or: curl https://goldsky.com/install | sh
goldsky login
goldsky subgraph deploy nexacademy-leaderboard/0.1.0 --path .
```

## Example queries

### Global leaderboard

```graphql
{
  userTotals(first: 100, orderBy: totalPoints, orderDirection: desc) {
    id
    totalPoints
    campaignsEntered
  }
}
```

### Per-campaign leaderboard

Campaign id must be scoped by contract (v1 vs v2):

```graphql
{
  userCampaigns(
    first: 100
    where: { contract: "0xV2_ADDRESS", campaignId: "7" }
    orderBy: points
    orderDirection: desc
  ) {
    user
    points
  }
}
```

### One user's breakdown (across v1 + v2)

```graphql
{
  userCampaigns(where: { user: "0xabc..." }) {
    contract
    campaignId
    points
  }
  userTotal(id: "0xabc...") {
    totalPoints
    campaignsEntered
  }
}
```

## Invariants

- `UserTotal.totalPoints == sum(UserCampaign.points where user = X)` — across both contracts.
- `CampaignTotal.totalPoints == sum(UserCampaign.points where contract = C and campaignId = N)`.
- `UserCampaign.points` equals the latest on-chain `totalPoints` for that (user, contract, campaignId) triple.
