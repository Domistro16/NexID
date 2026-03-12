import type { Address, Hash, Hex } from 'viem'

// ============ Chain Configuration ============

export interface ChainConfig {
    chainId: number
    registrar: Address
    priceOracle: Address
    resolver: Address
    nameWrapper: Address
    reverseRegistrar: Address
    registry: Address
    baseRegistrar: Address
    referralVerifier: Address
    premiumRegistry: Address
    auction: Address
    bulkRenewal: Address
    accountFactory: Address
    usdc: Address
    entryPoint: Address
}

// ============ Pricing Types ============

export interface PriceResult {
    /** Price in wei (for ETH payment) */
    priceWei: bigint
    /** Price in USD (18 decimals) */
    priceUsd: bigint
    /** Whether the name qualifies as an agent name */
    isAgentName: boolean
}

// ============ Registration Types ============

export interface RegisterRequest {
    /** Name to register (without .id suffix) */
    name: string
    /** Owner address for the registered name */
    owner: Address
    /** Secret for commit-reveal (zeroHash for agent names) */
    secret: Hash
    /** Resolver address to set */
    resolver: Address
    /** Resolver data to set during registration */
    data: Hex[]
    /** Whether to set reverse record */
    reverseRecord: boolean
    /** Fuses to set on the wrapped name */
    ownerControlledFuses: number
}

export interface RegisterOptions {
    /** Resolver address (defaults to AgentPublicResolver) */
    resolver?: Address
    /** Extra data to set on resolver */
    data?: Hex[]
    /** Set reverse record */
    reverseRecord?: boolean
    /** Owner controlled fuses */
    ownerControlledFuses?: number
    /** Referral data */
    referral?: ReferralData
    /** Referral signature */
    referralSignature?: Hex
    /** Text records to set (key-value pairs) */
    textRecords?: Record<string, string>
}

export interface ReferralData {
    referrer: Address
    registrant: Address
    nameHash: Hash
    referrerCodeHash: Hash
    deadline: bigint
    nonce: Hash
}

// ============ Relay Registration Types ============

export interface RelayOptions {
    /** Deploy an AA wallet for the agent */
    deployWallet?: boolean
    /** Salt for deterministic wallet address */
    walletSalt?: number
    /** Text records to set */
    textRecords?: Record<string, string>
    /** EIP-2612 permit signature for USDC */
    permit?: PermitSignature
    /** Paymaster permit bytes for gasless submission */
    paymasterPermit?: Hex
    /** UserOp signature from owner (if omitted, returns unsigned UserOp) */
    signature?: Hex
}

export interface PermitSignature {
    deadline: number
    v: number
    r: Hex
    s: Hex
}

// ============ UserOperation Types (ERC-4337) ============

export interface UserOperation {
    sender: Address
    nonce: Hex
    initCode: Hex
    callData: Hex
    callGasLimit: Hex
    verificationGasLimit: Hex
    preVerificationGas: Hex
    maxFeePerGas: Hex
    maxPriorityFeePerGas: Hex
    paymasterAndData: Hex
    signature: Hex
}

export interface BuildUserOpOptions {
    /** Deploy an AA wallet */
    deployWallet?: boolean
    /** Salt for deterministic wallet */
    walletSalt?: number
    /** Text records to set */
    textRecords?: Record<string, string>
}

// ============ x402 / ERC-8004 Types ============

export interface PaymentConfig {
    /** x402 payment endpoint URL */
    x402Endpoint?: string
    /** Payment address for the primary chain */
    paymentAddress?: Address
    /** Supported chain IDs */
    supportedChains?: number[]
    /** Agent metadata URI (IPFS or HTTPS) */
    agentMetadataURI?: string
    /** Whether payments are enabled */
    enabled?: boolean
}

export interface FullPaymentProfile {
    x402Endpoint: string
    paymentAddress: Address
    supportedChains: number[]
    agentMetadata: string
    paymentEnabled: boolean
}

// ============ Premium / Auction Types ============

export interface PremiumInfo {
    name: string
    isPremium: boolean
    requiresAuction: boolean
    fixedPrice: string
    hasActiveAuction: boolean
}

export interface AuctionInfo {
    id: number
    name: string
    reservePrice: string
    startTime: number
    endTime: number
    highestBid: string
    highestBidder: Address
    settled: boolean
    isUSDC: boolean
    status?: 'active' | 'ended' | 'settled'
}

// ============ Referral Types ============

export interface ReferralGenerateRequest {
    /** Referral code (domain name of referrer, without .id) */
    referralCode: string
    /** Address of the person being referred */
    registrantAddress: Address
    /** Name being registered */
    name: string
}

export interface ReferralGenerateResponse {
    success: boolean
    referralData: ReferralData
    signature: Hex
    error?: string
}

export interface ReferralValidateResponse {
    code: string
    valid: boolean
    owner: Address | null
    expiry: number | null
}

// ============ API Response Types ============

export interface ApiPriceResponse {
    name: string
    available: boolean
    priceWei: string
    priceUsd: string
    priceUsdFormatted: string
    priceEthFormatted: string
    isAgentName: boolean
}

export interface ApiRegisterResponse {
    success: boolean
    name: string
    fullName: string
    isAgentName: boolean
    transaction: {
        to: Address
        data: Hex
        value: string
        chainId: number
    }
    price: {
        wei: string
        eth: string
        usd: number
    }
    instructions: string
}

export interface ApiBatchRegisterResponse {
    success: boolean
    count: number
    names: { name: string; priceWei: string; isAgentName: boolean }[]
    transaction: {
        to: Address
        data: Hex
        value: string
        chainId: number
    }
    totalPrice: {
        wei: string
        eth: string
    }
    instructions: string
}

export interface ApiRelayResponse {
    success: boolean
    /** If signature was not provided, action is 'sign_required' */
    action?: 'sign_required'
    /** Unsigned UserOp (returned when signature not provided) */
    userOp?: UserOperation
    message: string
    priceUSDC: string
    isAgentName: boolean
    /** Transaction hash (returned when signature was provided) */
    txHash?: string
    name?: string
    fullName?: string
    agentWallet?: Address | null
}

export interface ApiBuildUserOpResponse {
    success: boolean
    name: string
    fullName: string
    priceUSDC: string
    isAgentName: boolean
    userOp: UserOperation
    instructions: {
        step1: string
        step2: string
        step3: string
    }
    circlePaymaster: Address
    entryPoint: Address
}

export interface ApiAutonomousResponse {
    success: boolean
    userOpHash: string
    message: string
}

export interface ApiConfigurePaymentResponse {
    success: boolean
    name: string
    fullName: string
    transactions: {
        description: string
        to: Address
        data: Hex
        value: string
    }[]
    chainId: number
    instructions: string
}

export interface ApiPaymentProfileResponse {
    name: string
    paymentAddress: Address
    supportedChains: number[]
    x402Endpoint: string
    paymentEnabled: boolean
    agentMetadata: string
}

// ============ SDK Configuration ============

export interface SafuDomainsConfig {
    /** Chain ID (8453 for Base, 84532 for Base Sepolia) */
    chainId: number
    /** Wallet client for write operations (optional) */
    walletClient?: any
    /** Public client for read operations (optional, created automatically) */
    publicClient?: any
    /** Custom contract addresses (optional) */
    contracts?: Partial<ChainConfig>
    /** Base URL for API calls (e.g., 'https://safudomains.com' or 'http://localhost:3000') */
    apiBaseUrl?: string
}
