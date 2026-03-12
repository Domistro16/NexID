# NexDomains — Smart Contracts

Solidity smart contracts implementing the **NexDomains** decentralized naming system — an ENS-compatible `.id` TLD deployed on **Base**. Extended from the ENS codebase to support multi-token domain pricing and an on-chain referral rewards system.

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
| `auction/` | Auction mechanism (optional) |
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
- **TokenPriceOracle** — Dynamic price oracle using Chainlink feeds for ETH/USD conversion.
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

### Name Wrapper (`wrapper/`)
Wraps `.id` domain NFTs with fuse-based permissions. Enables sub-name delegation with enforceable rules.

### Agent Registrar (`agent-registrar/`)
Specialized registrar for AI agent name registration with reduced pricing for long names (10+ characters matching agent patterns). Used by the NexDomains SDK for x402 / ERC-8004 agent identity.

## Networks

| Network | Chain ID | Purpose |
|---|---|---|
| Base Mainnet | 8453 | Primary production deployment |
| Base Sepolia | 84532 | Testnet / staging |

## Deployed Contracts (Base Mainnet)

| Contract | Address |
|---|---|
| AgentRegistrarController | `0xB5f3F983368e993b5f42D1dd659e4dC36fa5C494` |
| AgentPriceOracle | `0x15E2ccAeb4D1eeA1A7b8d839FFA30D63519D1c50` |
| AgentPublicResolver | `0x0a8C0f71C3Ec3FC8cB59F27885eb52C033780b6f` |
| NameWrapper | `0x90d848F20589437EF2e05a91130aEEA253512736` |
| ReverseRegistrar | `0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA` |
| Registry | `0xA590B208e7F2e62a3987424D2E1b00cd62986fAd` |
| BaseRegistrar | `0xCAfd2aCA95B79Ce2De0047F2309FCaB33Da75E9C` |
| ReferralVerifier | `0x212c27756529679efBd46cb35440b2e4DC28e33C` |

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
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
DEPLOYER_KEY=your_private_key
BASESCAN_API_KEY=your_basescan_api_key
ETH_USD_ORACLE=0x...   # Chainlink ETH/USD feed on Base
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
# Base Sepolia
NODE_OPTIONS='--experimental-loader ts-node/esm/transpile-only' bun run hardhat --network baseSepolia deploy

# Base Mainnet
NODE_OPTIONS='--experimental-loader ts-node/esm/transpile-only' bun run hardhat --network base deploy
```

### Test ENS Minting End-to-End

```bash
npx hardhat run scripts/ens-test.ts --network baseSepolia
```

### Verify on Basescan

```bash
npx hardhat verify --network base <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Forking for Your Own TLD

To deploy this system under a different TLD (e.g. `.nex`):

1. Replace all instances of `.id` in contracts and deploy scripts with your TLD
2. Update `CRE8OR_NODE` with `Namehash(<YourTLD>)` and `CRE8OR_LABELHASH` with `keccak256(<YourTLD>)`
3. Update `names[CRE8OR_NODE]` with the DNS-encoded version of your TLD (e.g. `"\x03nex\x00"` for `.nex`)

## License

MIT
