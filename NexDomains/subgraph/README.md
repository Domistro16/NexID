# NexDomains — Subgraph

A [The Graph](https://thegraph.com/) subgraph that indexes events from the **NexDomains** ENS-compatible contracts on BNB Chain. Provides a fast GraphQL API for querying domain ownership, resolver records, registrations, and all ENS event history.

Deployed subgraph endpoint:
```
https://api.studio.thegraph.com/query/112443/ens-subgraph/v0.0.1
```

## What It Indexes

- **Domain registrations**: label name, expiry date, registrant
- **Ownership transfers**: who owns which `.id` name at what block
- **Resolver records**: address records, text records, content hashes, ABI, pubkeys
- **Subgraph events**: `AddrChanged`, `NameChanged`, `AbiChanged`, `PubkeyChanged`, `TextChanged`, `ContenthashChanged`, `InterfaceChanged`, `AuthorisationChanged`

## Project Structure

```
subgraph/
├── src/                  # AssemblyScript mapping handlers
├── abis/                 # Contract ABIs (8 JSON files)
├── tests/                # Matchstick unit tests
├── schema.graphql        # GraphQL data schema
├── subgraph.yaml         # Subgraph manifest (data sources, start blocks)
├── networks.json         # Contract addresses per network
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies and scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- yarn (recommended) or npm
- The Graph CLI (`npm install -g @graphprotocol/graph-cli`)

### Install

```bash
yarn install
```

### Code Generation

Generate AssemblyScript types from the schema and ABIs:

```bash
npx graph codegen
```

### Build

```bash
npx graph build
```

### Test

Unit tests are written using [Matchstick](https://thegraph.com/docs/en/developing/unit-testing-framework/):

```bash
npx graph test
```

### Deploy

```bash
# Deploy to The Graph Studio
npx graph deploy --studio <SUBGRAPH_SLUG>

# Or authenticate and deploy
npx graph auth --studio <DEPLOY_KEY>
npx graph deploy --studio nexid-ens-subgraph
```

Update `networks.json` with the correct contract addresses for your target network before deploying.

## Schema Overview

Key entities in `schema.graphql`:

| Entity | Description |
|---|---|
| `Domain` | A registered domain node (label, parent, owner, resolver, TTL) |
| `Registration` | Active registration with expiry date and registrant |
| `Resolver` | Resolver contract linked to a domain with all its records |
| `Account` | An Ethereum address that has interacted with the system |
| `Transfer` | Domain ownership transfer event |
| Various `*Changed` events | Emitted when resolver records are updated |

## Example Queries

### Get Recent Registrations (Soonest to Expire)

```graphql
{
  registrations(
    where: { labelName_not: null }
    orderBy: expiryDate
    orderDirection: asc
    first: 10
  ) {
    expiryDate
    labelName
    domain {
      name
      labelName
    }
  }
}
```

### Get All Domains with Their Owners and Resolvers

```graphql
{
  domains {
    id
    labelName
    labelhash
    parent { id }
    subdomains { id }
    owner { id }
    resolver { id }
    ttl
  }
}
```

### Get Resolver Records for a Domain

```graphql
{
  resolvers(where: { domain: "<DOMAIN_NODE_HEX>" }) {
    id
    address
    events {
      id
      node
      ... on AddrChanged { a }
      ... on NameChanged { name }
      ... on TextChanged { indexedKey key }
      ... on ContenthashChanged { hash }
    }
  }
}
```

## Using the Subgraph in Your App

The NexDomains frontend connects using Apollo Client:

```typescript
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client'

const client = new ApolloClient({
  link: new HttpLink({
    uri: 'https://api.studio.thegraph.com/query/112443/ens-subgraph/v0.0.1',
  }),
  cache: new InMemoryCache(),
})
```

## Resources

- [The Graph Documentation](https://thegraph.com/docs/)
- [Matchstick Testing Framework](https://thegraph.com/docs/en/developing/unit-testing-framework/)
- [ENS Subgraph (reference)](https://github.com/ensdomains/ens-subgraph)

## License

MIT
