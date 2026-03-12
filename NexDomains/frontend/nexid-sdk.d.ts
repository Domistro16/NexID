declare module '@nexid/sdk' {
  export class NexDomains {
    constructor(config: { chainId: number; walletClient?: any })
    publicClient: any
    available(name: string): Promise<boolean>
    getPrice(name: string): Promise<{
      priceWei: bigint
      priceUsd: bigint
      isAgentName: boolean
    }>
    getX402Endpoint(name: string): Promise<string>
    isPaymentEnabled(name: string): Promise<boolean>
    getPaymentAddress(name: string, chainId: number): Promise<`0x${string}`>
    setPaymentAddress(name: string, chainId: number, addr: `0x${string}`): Promise<void>
    setX402Endpoint(name: string, endpoint: string): Promise<void>
    setPaymentEnabled(name: string, enabled: boolean): Promise<void>
    getPaymentProfile(
      name: string,
      chainId: number,
    ): Promise<{
      paymentAddress: `0x${string}`
      supportedChains: number[]
      agentMetadata: string
      paymentEnabled: boolean
      x402Endpoint: string
    }>
  }

  export const AgentRegistrarControllerAbi: readonly Record<string, unknown>[]
  export const AgentPriceOracleAbi: readonly Record<string, unknown>[]
  export const AgentPublicResolverAbi: readonly Record<string, unknown>[]
  export const NameWrapperAbi: readonly Record<string, unknown>[]
}
