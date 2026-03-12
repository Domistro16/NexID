# NexDomains — Smart Contracts

Solidity smart contracts implementing the **NexDomains** decentralized naming system — an ENS-compatible `.id` TLD deployed on **BNB Smart Chain**. Forked and extended from the ENS codebase to support multi-token domain pricing (BNB, CAKE, USD1) and an on-chain referral rewards system.

## Architecture

The contract system is organized into subdirectories by concern:

| Directory | Description |
|---|---|
| `registry/` | ENS registry core — maps domain names to owners, resolvers, and TTLs |
| `ethregistrar/` | Domain registration controller — commit/reveal registration flow with pricing oracle |
| `resolvers/` | ENS resolver profiles — maps names to addresses, text records, content hashes, DNS data, etc. |
| `reverseRegistrar/` | Reverse resolution — maps wallet address → `.id` primary name |
| `wrapper/` | Name Wrapper — wraps `.id` NFTs with fuse-based permissions |
| `root/` | Root ownership contract for the `.` root node |
| `auction/` | Auction mechanism (legacy/optional) |
| `agent-registrar/` | Agent registrar — specialized registration for AI agent identities |
| `dnsregistrar/` | DNS registrar — allows DNS domain owners to claim ENS equivalents |
| `dnssec-oracle/` | DNSSEC oracle — verifies DNS proofs on-chain |
| `utils/` | Shared utility contracts and libraries |
| `wallet/` | Wallet integration helpers |
| `test/` | Shared test fixtures and mock contracts |

## Key Contracts

### Registry
- **ENSRegistry** — Central contract. All lookups begin here. Stores owner, resolver, and TTL per node.
- **ENSRegistryWithFallback** — Updated registry with fallback to legacy contract.
- **FIFSRegistrar** — First-in-first-served subdomain registrar.
- **ReverseRegistrar** — Manages `.addr.reverse` lookups.

### ETH Registrar (`.id` Registration)
- **BaseRegistrar** — Owns the `.id` node. Manages controller access.
- **ETHRegistrarController** — Registration/renewal with commit/reveal anti-frontrunning.
- **SimplePriceOracle** — Fixed-price oracle (for testing).
- **TokenPriceOracle** — Dynamic price oracle using Chainlink feeds for BNB/USD and CAKE/USD conversion.
- **ReferralController** — Tracks referrals and distributes a share of registration fees to referrers.

### Resolvers
`PublicResolver` implements the following EIP standards:
- EIP-137 & 2304: `addr()` (address resolution + multicoin)
- EIP-181: `name()` (reverse resolution)
- EIP-205: `ABI()`
- EIP-619: `pubkey()`
- EIP-634: `text()` (text records)
- EIP-1577: `contenthash()`
- EIP-165: `supportsInterface()`
- Experimental DNS hosting support

### Name Wrapper (`wrapper/`)
Wraps `.id` domain NFTs with fuse-based permissions. Enables sub-name delegation with enforceable rules.

### Agent Registrar (`agent-registrar/`)
Specialized registrar for AI agent name registration with reduced pricing for long names (10+ characters matching agent patterns). Used by the NexDomains SDK for x402 / ERC-8004 agent identity.

## Networks

| Network | Chain ID | Purpose |
|---|---|---|
| BSC Mainnet | 56 | Primary production deployment |
| BSC Testnet | 97 | Staging and testing |
| Plasma Network | 9745 | Alternative BNB deployment |

## Deployed Contracts (BSC Mainnet)

| Contract | Address |
|---|---|
| Controller | `0x48511b6c15fe1F89bAf6b30dBFA35bF0eAaEB751` |
| Registry | `0x6aEFc7ac590096c08187a9052030dA59dEd7E996` |
| ReverseRegistrar | `0xc070aAcE207ad5eb2A460D059785ffC9D4D2C536` |
| BaseRegistrar | `0xc85f95FCe09b582D546606f591CEEC88D88714f5` |
| NameWrapper | `0x86a930d1931C11e3Ec46b3A050E27F29bF94B612` |
| PublicResolver | `0xcAa73Cd19614523F9F3cfCa4A447120ceA8fd357` |
| Referral | `0x182690bD985ef02Ae44A6F8a2e71666bDe1196E2` |

## Getting Started

### Prerequisites

- Node.js 18+ and bun (or npm)

### Install

```bash
bun install
# or
npm install
```

### Environment

```env
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
DEPLOYER_KEY=your_private_key
BSCSCAN_API_KEY=your_bscscan_key
BNB_USD_ORACLE=chainlink_feed_address
CAKE_USD_ORACLE=chainlink_feed_address
```

### Compile

```bash
npx hardhat compile
```

### Test

```bash
bun run test
```

### Deploy

```bash
# BSC Testnet
NODE_OPTIONS='--experimental-loader ts-node/esm/transpile-only' bun run hardhat --network testnet deploy

# BSC Mainnet
NODE_OPTIONS='--experimental-loader ts-node/esm/transpile-only' bun run hardhat --network bsc deploy
```

### Test ENS Minting End-to-End

```bash
npx hardhat run scripts/ens-test.ts --network bscTestnet
```

### Verify on BSCScan

```bash
npx hardhat verify --network bsc <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Forking for Your Own TLD

To deploy this system under a different TLD (e.g. `.nex`):

1. Replace all instances of `.id` in contracts and deploy scripts with your TLD
2. Update the `CRE8OR_NODE` with `Namehash(<YourTLD>)` and `CRE8OR_LABELHASH` with `keccak256(<YourTLD>)`
3. Update `names[CRE8OR_NODE]` with the DNS-encoded version of your TLD (e.g. `"\x03nex\x00"` for `.nex`)

Refer to the main [NexDomains README](../README.md) for the full pre-deployment checklist.

## License

MIT
