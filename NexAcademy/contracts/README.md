# NexAcademy — Smart Contracts

Solidity smart contracts powering the **NexAcademy** learn-to-earn campaign platform, deployed on **Base**.

## Contracts

| Contract | Description |
|---|---|
| `NexIDCampaigns.sol` | Core NexID campaign registry — creates and manages internal campaigns tied to the `.id` domain ecosystem |
| `PartnerCampaigns.sol` | Partner-sponsored campaign system — allows external protocols to create and fund their own educational campaigns |
| `CampaignEscrow.sol` | Escrow contract that holds and distributes USDC rewards to users who complete qualifying campaign tasks |
| `ENS.sol` | ENS registry interface used to verify `.id` domain ownership for access-gating |
| `INameResolver.sol` | Interface for resolving names from the ENS/NexDomains resolver |
| `IReverseRegistrar.sol` | Interface for reverse-look up: wallet address → `.id` primary name |

### `contracts/test/`

Helper contracts and mock implementations used in the Hardhat test suite.

## How It Works

1. A protocol (partner) creates a campaign and deposits USDC into `CampaignEscrow`
2. Users connect their wallet and verify a `.id` domain via `IReverseRegistrar`
3. Users complete video lessons and on-chain tasks tracked by the NexAcademy web app
4. Upon campaign completion, eligible users can claim their USDC allocation through the escrow contract (gasless via backend relayer)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# Base RPC URL
API_URL=https://mainnet.base.org

# Deployer wallet
PRIVATE_KEY=your_private_key_here

# Contract admin
OWNER_ADDRESS=your_wallet_address

# Basescan contract verification
BASESCAN_API_KEY=your_api_key
```

### Scripts

| Command | Description |
|---|---|
| `npm run build` | Compile contracts with Hardhat |
| `npm test` | Run the Hardhat test suite |
| `npm run local:start` | Start a local Hardhat node |
| `npm run local:deploy` | Deploy to local Hardhat node |
| `npm run deploy:contracts` | Deploy campaign contracts to Base Mainnet |
| `npm run deploy:campaign-escrow` | Deploy escrow contract to Base Sepolia |

### Compile

```bash
npx hardhat compile
```

### Deploy

```bash
# Local node
npx hardhat run scripts/deploy.ts --network local

# Base Sepolia (testnet)
npx hardhat run scripts/deploy-campaign-escrow.ts --network baseSepolia

# Base Mainnet
npx hardhat run scripts/deploy.ts --network base
```

### Verify

```bash
npx hardhat verify --network base <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

### Test

```bash
npx hardhat test

# With gas report
REPORT_GAS=true npx hardhat test
```

## Networks

| Network | Chain ID | RPC |
|---|---|---|
| Base Mainnet | 8453 | https://mainnet.base.org |
| Base Sepolia | 84532 | https://sepolia.base.org |
| Hardhat local | 31337 | http://localhost:8545 |

## Key Dependencies

- [Hardhat](https://hardhat.org/) — Ethereum development framework
- [OpenZeppelin Contracts 5.x](https://docs.openzeppelin.com/contracts/5.x/) — Security primitives (access control, ERC20, etc.)
- [Ethers 6.x](https://docs.ethers.org/v6/) — Contract deployment and interaction

## License

MIT
