// Chain-specific contract addresses for SafuDomains resolution
interface ChainConstants {
    ReverseRegistrar: `0x${string}`;
    Registry: `0x${string}`;
}

const BASE_MAINNET: ChainConstants = {
    ReverseRegistrar: '0x38171C9Dc51c5F9b2Be96b8fde3D0CA8C6050eAA',
    Registry: '0xA590B208e7F2e62a3987424D2E1b00cd62986fAd',
};

export function getConstants(chainId: number): ChainConstants {
    // Default to Base mainnet addresses for any chain
    return BASE_MAINNET;
}
