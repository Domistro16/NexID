# NexDomains — Deploy Scripts

Hardhat-deploy scripts for deploying the **NexDomains** ENS contract system to **Base**. Each script deploys a specific component of the system, and they are run in dependency order.

## Deploy Directory Structure

```
deploy/
├── registry/             # Deploy ENS Registry and supporting registrars
├── ethregistrar/         # Deploy Base Registrar and ETHRegistrarController
├── resolvers/            # Deploy PublicResolver / AgentPublicResolver
├── reverseRegistrar/     # Deploy ReverseRegistrar
├── root/                 # Deploy Root ownership contract
├── wrapper/              # Deploy NameWrapper
└── agent-registrar/      # Deploy AgentRegistrar and AgentPriceOracle
```

Each subdirectory contains one or more Hardhat deploy scripts that handle:
1. Contract construction with correct constructor arguments
2. Linking contracts to each other (e.g., setting the controller on BaseRegistrar)
3. Saving deployment artifacts for verification and future reference

## Deployment Order

Deploy contracts in this order to satisfy dependencies:

1. **Registry** — Must be deployed first; all other contracts reference it
2. **ReverseRegistrar** — Depends on Registry
3. **Root** — Depends on Registry
4. **BaseRegistrar** — Depends on Registry + Root
5. **PriceOracle** (AgentPriceOracle or SimplePriceOracle)
6. **ETHRegistrarController / AgentRegistrarController** — Depends on BaseRegistrar + PriceOracle
7. **PublicResolver / AgentPublicResolver** — Depends on Registry + NameWrapper
8. **NameWrapper** — Depends on Registry + BaseRegistrar
9. **ReferralVerifier** — Depends on controller
10. **AgentRegistrar** — Depends on BaseRegistrar + PriceOracle

## Running Deploys

### Base Sepolia (Testnet)

```bash
NODE_OPTIONS='--experimental-loader ts-node/esm/transpile-only' \
  bun run hardhat --network baseSepolia deploy
```

### Base Mainnet

```bash
NODE_OPTIONS='--experimental-loader ts-node/esm/transpile-only' \
  bun run hardhat --network base deploy
```

### Deploy a Specific Script

```bash
npx hardhat run deploy/registry/00_deploy_registry.ts --network baseSepolia
```

## Environment Variables

```env
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
DEPLOYER_KEY=your_private_key
BASESCAN_API_KEY=your_basescan_api_key
ETH_USD_ORACLE=0x...    # Chainlink ETH/USD feed on Base
```

## Post-Deployment

After deploying all contracts:

1. **Set controller on BaseRegistrar** — authorize `AgentRegistrarController`
2. **Set root ownership** — transfer root node to Root contract
3. **Configure resolver** — set default resolver on Registry
4. **Set reverseRegistrar** on Registry
5. **Test minting**:
   ```bash
   npx hardhat run scripts/ens-test.ts --network baseSepolia
   ```
6. **Verify on Basescan**:
   ```bash
   npx hardhat verify --network base <ADDRESS> <CONSTRUCTOR_ARGS>
   ```

## Deployments Archive

Historical deployment artifacts (addresses per network, block numbers, ABIs) are stored in the [`deployments/`](../deployments/) directory, organized by network name.

## Network Configuration

Full network config is in [`hardhat.config.cts`](../hardhat.config.cts). Supported networks:

| Network | Chain ID |
|---|---|
| `base` | 8453 (Mainnet) |
| `baseSepolia` | 84532 (Testnet) |

## License

MIT
