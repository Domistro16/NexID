export type NexMarketsContracts = {
  chainId: number;
  network: "baseSepolia" | "base";
  collateral?: string;
  marketImplementation?: string;
  marketFactory?: string;
  sponsoredMarketFactory?: string;
  legacyMarketFactories?: readonly string[];
  launchStakeVault?: string;
  feeRouter?: string;
  tokenBuybackBurner?: string;
  resolutionManager?: string;
  targetOrderExecutor?: string;
  genesisLauncher?: string;
};

export const DEFAULT_NEXMARKETS_CHAIN_ID = 8453;

export const NEXMARKETS_CONTRACTS = {
  84532: {
    chainId: 84532,
    network: "baseSepolia",
    collateral: "0xfb6F29F5aa37cB7b3900d18c6368bF5E4daF9342",
    marketFactory: "0x8fEC229Bb4b27a52ed67CF8307FfACbfeB4559D3",
    launchStakeVault: "0xF6aE5797a22FaEcd729437b8C29d8eE16062E2BF",
    feeRouter: "0x52D9DCf5d7A77b134ed727BD2DA80543b277A723",
    resolutionManager: "0xBC426213dc3dc25B925A2750aeD7782654Bef1E8",
    targetOrderExecutor: "0x51AA33bA6D34Aa41eb56fC78458d1387953C3D3a"
  },
  8453: {
    chainId: 8453,
    network: "base",
    collateral: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    marketImplementation: "0xE95d8bA0d96e409f37e05f33B90b3762C1E0ed30",
    marketFactory: "0xe6e771517786d7Ab4115Efcc788A86b38f80D60f",
    sponsoredMarketFactory: "0xA7bf85E853a9A9367AC5Ecd31E9Ed85B6F2A113e",
    launchStakeVault: "0xeCf7159B4A9AD2290423Bb0cbbA92b90359Fe96D",
    feeRouter: "0x568Ac7501AB9275Cc29eDD19C56b29cd8C6994Dd",
    tokenBuybackBurner: "0x87A7580cF3ba2a93AB872195319C903a5c568067",
    resolutionManager: "0xd5c7875EfbD9B10Da236eb52d9F61bfFE5309453",
    targetOrderExecutor: "0xce104555142914565D9A0bd71EE4B39340329800",
    genesisLauncher: "0x7ec76611Da0AeE7C1B11273E9767FDA1Faa31790"
  }
} as const satisfies Record<number, NexMarketsContracts>;

export function nexMarketsContracts(chainId = DEFAULT_NEXMARKETS_CHAIN_ID): NexMarketsContracts | undefined {
  return NEXMARKETS_CONTRACTS[chainId as keyof typeof NEXMARKETS_CONTRACTS];
}

export function nexMarketsChainIdForNetwork(networkName: string) {
  if (networkName === "base") return 8453;
  return 84532;
}
