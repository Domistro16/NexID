# NexDomains — Deploy Scripts

Hardhat-deploy scripts for deploying the **NexDomains** ENS contract system to BNB Chain. Each script deploys a specific component of the system, and they are run in dependency order.

## Deploy Directory Structure

```
deploy/
├── registry/             # Deploy ENS Registry and supporting registrars
├── ethregistrar/         # Deploy Base Registrar and ETHRegistrarController
├── resolvers/            # Deploy PublicResolver
├── reverseRegistrar/     # Deploy ReverseRegistrar
├── root/                 # Deploy Root ownership contract
├── wrapper/              # Deploy NameWrapper
└── agent-registrar/      # Deploy Agent Registrar
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
5. **PriceOracle** (TokenPriceOracle or SimplePriceOracle)
6. **ETHRegistrarController** — Depends on BaseRegistrar + PriceOracle
7. **PublicResolver** — Depends on Registry + NameWrapper
8. **NameWrapper** — Depends on Registry + BaseRegistrar
9. **ReferralController** — Depends on ETHRegistrarController
10. **AgentRegistrar** — Depends on BaseRegistrar + PriceOracle

## Running Deploys

### BSC Testnet

```bash
NODE_OPTIONS='--experimental-loader ts-node/esm/transpile-only' \
  bun run hardhat --network testnet deploy
```

### BSC Mainnet

```bash
NODE_OPTIONS='--experimental-loader ts-node/esm/transpile-only' \
  bun run hardhat --network bsc deploy
```

### Deploy a Specific Script (Hardhat)

```bash
npx hardhat run deploy/registry/00_deploy_registry.ts --network bscTestnet
```

## Environment Variables

```env
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
DEPLOYER_KEY=your_private_key
BSCSCAN_API_KEY=your_bscscan_api_key
BNB_USD_ORACLE=0x...    # Chainlink BNB/USD feed on BSC
CAKE_USD_ORACLE=0x...   # Chainlink CAKE/USD feed on BSC
```

## Post-Deployment

After deploying all contracts:

1. **Set controller on BaseRegistrar** — authorize `ETHRegistrarController`
2. **Set root ownership** — transfer root node to Root contract
3. **Configure resolver** — set default resolver on Registry
4. **Set reverseRegistrar** on Registry
5. **Test minting**:
   ```bash
   npx hardhat run scripts/ens-test.ts --network bscTestnet
   ```
6. **Verify on BSCScan**:
   ```bash
   npx hardhat verify --network bsc <ADDRESS> <CONSTRUCTOR_ARGS>
   ```

## Deployments Archive

Historical deployment artifacts (addresses per network, block numbers, ABIs) are stored in the [`deployments/`](../deployments/) directory, organized by network name.

## Network Configuration

Full network config is in [`hardhat.config.cts`](../hardhat.config.cts). Supported networks:

| Network | Chain ID |
|---|---|
| `bsc` | 56 (Mainnet) |
| `bscTestnet` | 97 (Testnet) |
| `plasma` | 9745 |

## License

MIT
