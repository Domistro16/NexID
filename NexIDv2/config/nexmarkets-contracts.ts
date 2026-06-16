export type NexMarketsContracts = {
  chainId: number;
  network: "baseSepolia" | "base";
  collateral?: string;
  marketFactory?: string;
  launchStakeVault?: string;
  feeRouter?: string;
  resolutionManager?: string;
  targetOrderExecutor?: string;
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
    marketFactory: "0x06b5f1EfF6798cd6FaBd7ca9D57Bb5670D58F763",
    launchStakeVault: "0x501411eafcC5847C05e9e8D27DF3e72a52301cee",
    feeRouter: "0x8085936e00f14Ada3E82A8f3C0474781E3C6e70d",
    resolutionManager: "0xe0E553aE917436D5F871CE592ceC3C5396896D3A",
    targetOrderExecutor: "0x7Bd469c4f326Ec780467902B3f8Aa6cc2EF551B7"
  }
} as const satisfies Record<number, NexMarketsContracts>;

export function nexMarketsContracts(chainId = DEFAULT_NEXMARKETS_CHAIN_ID): NexMarketsContracts | undefined {
  return NEXMARKETS_CONTRACTS[chainId as keyof typeof NEXMARKETS_CONTRACTS];
}

export function nexMarketsChainIdForNetwork(networkName: string) {
  if (networkName === "base") return 8453;
  return 84532;
}
