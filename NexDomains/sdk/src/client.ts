import {
    createPublicClient,
    http,
    namehash,
    labelhash,
    type PublicClient,
    type WalletClient,
    type Address,
    type Hash,
} from 'viem'
import { base, baseSepolia } from 'viem/chains'
import type {
    SafuDomainsConfig,
    PriceResult,
    RegisterOptions,
    PaymentConfig,
    FullPaymentProfile,
    ChainConfig,
    RelayOptions,
    BuildUserOpOptions,
    UserOperation,
    ApiPriceResponse,
    ApiRegisterResponse,
    ApiBatchRegisterResponse,
    ApiRelayResponse,
    ApiBuildUserOpResponse,
    ApiAutonomousResponse,
    ApiConfigurePaymentResponse,
    ApiPaymentProfileResponse,
    ReferralGenerateResponse,
    ReferralValidateResponse,
    PremiumInfo,
    AuctionInfo,
} from './types'
import {
    CHAIN_CONFIGS,
    TLD,
    EMPTY_REFERRAL_DATA,
    EMPTY_REFERRAL_SIGNATURE,
} from './constants'
import {
    AgentPriceOracleAbi,
    AgentRegistrarControllerAbi,
    AgentPublicResolverAbi,
    NameWrapperAbi,
    AgentAccountFactoryAbi,
    EntryPointAbi,
} from './abis'
/**
 * NexDomains SDK Client
 *
 * Main entry point for interacting with NexDomains v2.
 * Supports both direct on-chain interactions and API-based registration.
 *
 * @example
 * ```typescript
 * import { NexDomains } from '@nexid/sdk'
 *
 * // API-based usage (no wallet required for read operations)
 * const sdk = new NexDomains({
 *   chainId: 84532, // Base Sepolia
 *   apiBaseUrl: 'https://names.nexid.fun',
 * })
 *
 * // Fetch domain price via API
 * const price = await sdk.apiGetPrice('my-trading-agent')
 *
 * // Register via API (returns unsigned transaction data to sign)
 * const { tx } = await sdk.apiRegister('my-trading-agent', '0x...')
 *
 * // Direct on-chain usage (requires wallet client)
 * const sdk2 = new NexDomains({
 *   chainId: 84532,
 *   walletClient,
 * })
 *
 * await sdk2.register('my-agent')
 * ```
 */

export class NexDomains {
    public readonly chainId: number
    public readonly config: ChainConfig
    public readonly publicClient: PublicClient
    public walletClient?: WalletClient
    public readonly apiBaseUrl?: string

    constructor(options: SafuDomainsConfig) {
        this.chainId = options.chainId
        this.walletClient = options.walletClient
        this.apiBaseUrl = options.apiBaseUrl?.replace(/\/$/, '')

        // Get chain config
        const chainConfig = CHAIN_CONFIGS[options.chainId]
        if (!chainConfig && !options.contracts) {
            throw new Error(`Unsupported chainId: ${options.chainId}. Use 8453 (Base) or 84532 (Base Sepolia)`)
        }

        // Merge custom contracts with defaults
        this.config = {
            ...chainConfig,
            ...options.contracts,
        } as ChainConfig

        // Create public client if not provided
        if (options.publicClient) {
            this.publicClient = options.publicClient
        } else {
            const chain = options.chainId === 8453 ? base : baseSepolia
            this.publicClient = createPublicClient({
                chain,
                transport: http(),
            })
        }
    }

    // ================================================================
    // On-Chain: Pricing Functions
    // ================================================================

    /**
     * Get the price for a domain name (on-chain)
     */
    async getPrice(name: string): Promise<PriceResult> {
        const result = await this.publicClient.readContract({
            address: this.config.priceOracle,
            abi: AgentPriceOracleAbi,
            functionName: 'getPrice',
            args: [name],
        })

        return {
            priceWei: result.priceWei,
            priceUsd: result.priceUsd,
            isAgentName: result.isAgentName,
        }
    }

    /**
     * Check if a name qualifies as an agent name (10+ chars + pattern match)
     */
    async isAgentName(name: string): Promise<boolean> {
        return await this.publicClient.readContract({
            address: this.config.priceOracle,
            abi: AgentPriceOracleAbi,
            functionName: 'isAgentName',
            args: [name],
        })
    }

    /**
     * Get the number of pattern matches for a name
     */
    async getPatternMatchCount(name: string): Promise<bigint> {
        return await this.publicClient.readContract({
            address: this.config.priceOracle,
            abi: AgentPriceOracleAbi,
            functionName: 'getPatternMatchCount',
            args: [name],
        })
    }

    // ================================================================
    // On-Chain: Registration Functions
    // ================================================================

    /**
     * Check if a name is available for registration (on-chain)
     */
    async available(name: string): Promise<boolean> {
        return await this.publicClient.readContract({
            address: this.config.registrar,
            abi: AgentRegistrarControllerAbi,
            functionName: 'available',
            args: [name],
        })
    }

    /**
     * Register a domain name (on-chain, ETH payment)
     * Requires walletClient
     */
    async register(name: string, options: RegisterOptions = {}): Promise<Hash> {
        if (!this.walletClient) {
            throw new Error('WalletClient required for write operations')
        }

        const [account] = await this.walletClient.getAddresses()
        const price = await this.getPrice(name)

        const request = {
            name,
            owner: account,
            secret: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hash,
            resolver: options.resolver || this.config.resolver,
            data: options.data || [],
            reverseRecord: options.reverseRecord ?? false,
            ownerControlledFuses: options.ownerControlledFuses ?? 0,
        }

        const referralData = options.referral || EMPTY_REFERRAL_DATA
        const referralSignature = options.referralSignature || EMPTY_REFERRAL_SIGNATURE

        const hash = await this.walletClient.writeContract({
            address: this.config.registrar,
            abi: AgentRegistrarControllerAbi,
            functionName: 'register',
            args: [request, referralData, referralSignature],
            value: price.priceWei,
            account,
            chain: this.chainId === 8453 ? base : baseSepolia,
        })

        return hash
    }

    /**
     * Batch register multiple domain names (on-chain, ETH payment)
     * Requires walletClient
     */
    async batchRegister(names: string[], options: RegisterOptions = {}): Promise<Hash> {
        if (!this.walletClient) {
            throw new Error('WalletClient required for write operations')
        }

        const [account] = await this.walletClient.getAddresses()

        // Calculate total price
        let totalPrice = 0n
        for (const name of names) {
            const price = await this.getPrice(name)
            totalPrice += price.priceWei
        }

        const requests = names.map((name) => ({
            name,
            owner: account,
            secret: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hash,
            resolver: options.resolver || this.config.resolver,
            data: options.data || [],
            reverseRecord: options.reverseRecord ?? false,
            ownerControlledFuses: options.ownerControlledFuses ?? 0,
        }))

        const hash = await this.walletClient.writeContract({
            address: this.config.registrar,
            abi: AgentRegistrarControllerAbi,
            functionName: 'batchRegister',
            args: [requests],
            value: totalPrice,
            account,
            chain: this.chainId === 8453 ? base : baseSepolia,
        })

        return hash
    }

    // ================================================================
    // On-Chain: x402 / ERC-8004 Payment Profile
    // ================================================================

    /**
     * Get the x402 payment endpoint for a domain
     */
    async getX402Endpoint(name: string): Promise<string> {
        const node = this.namehash(name)
        return await this.publicClient.readContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'x402Endpoint',
            args: [node],
        })
    }

    /**
     * Set the x402 payment endpoint for a domain
     */
    async setX402Endpoint(name: string, endpoint: string): Promise<Hash> {
        if (!this.walletClient) {
            throw new Error('WalletClient required for write operations')
        }

        const [account] = await this.walletClient.getAddresses()
        const node = this.namehash(name)

        return await this.walletClient.writeContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'setX402Endpoint',
            args: [node, endpoint],
            account,
            chain: this.chainId === 8453 ? base : baseSepolia,
        })
    }

    /**
     * Get the payment address for a domain on a specific chain
     */
    async getPaymentAddress(name: string, chainId: number): Promise<Address> {
        const node = this.namehash(name)
        return await this.publicClient.readContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'paymentAddress',
            args: [node, BigInt(chainId)],
        })
    }

    /**
     * Set the payment address for a domain on a specific chain
     */
    async setPaymentAddress(name: string, chainId: number, addr: Address): Promise<Hash> {
        if (!this.walletClient) {
            throw new Error('WalletClient required for write operations')
        }

        const [account] = await this.walletClient.getAddresses()
        const node = this.namehash(name)

        return await this.walletClient.writeContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'setPaymentAddress',
            args: [node, BigInt(chainId), addr],
            account,
            chain: this.chainId === 8453 ? base : baseSepolia,
        })
    }

    /**
     * Get supported chains for a domain
     */
    async getSupportedChains(name: string): Promise<bigint[]> {
        const node = this.namehash(name)
        const result = await this.publicClient.readContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'supportedChains',
            args: [node],
        })
        return [...result]
    }

    /**
     * Set supported chains for a domain
     */
    async setSupportedChains(name: string, chainIds: number[]): Promise<Hash> {
        if (!this.walletClient) {
            throw new Error('WalletClient required for write operations')
        }

        const [account] = await this.walletClient.getAddresses()
        const node = this.namehash(name)

        return await this.walletClient.writeContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'setSupportedChains',
            args: [node, chainIds.map(BigInt)],
            account,
            chain: this.chainId === 8453 ? base : baseSepolia,
        })
    }

    /**
     * Get agent metadata URI for a domain
     */
    async getAgentMetadata(name: string): Promise<string> {
        const node = this.namehash(name)
        return await this.publicClient.readContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'agentMetadata',
            args: [node],
        })
    }

    /**
     * Set agent metadata URI for a domain
     */
    async setAgentMetadata(name: string, uri: string): Promise<Hash> {
        if (!this.walletClient) {
            throw new Error('WalletClient required for write operations')
        }

        const [account] = await this.walletClient.getAddresses()
        const node = this.namehash(name)

        return await this.walletClient.writeContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'setAgentMetadata',
            args: [node, uri],
            account,
            chain: this.chainId === 8453 ? base : baseSepolia,
        })
    }

    /**
     * Check if payments are enabled for a domain
     */
    async isPaymentEnabled(name: string): Promise<boolean> {
        const node = this.namehash(name)
        return await this.publicClient.readContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'paymentEnabled',
            args: [node],
        })
    }

    /**
     * Enable or disable payments for a domain
     */
    async setPaymentEnabled(name: string, enabled: boolean): Promise<Hash> {
        if (!this.walletClient) {
            throw new Error('WalletClient required for write operations')
        }

        const [account] = await this.walletClient.getAddresses()
        const node = this.namehash(name)

        return await this.walletClient.writeContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'setPaymentEnabled',
            args: [node, enabled],
            account,
            chain: this.chainId === 8453 ? base : baseSepolia,
        })
    }

    /**
     * Set accepted tokens for a domain on a specific chain
     */

    /**
     * Get full payment profile for a domain (on-chain)
     */
    async getPaymentProfile(name: string, chainId: number): Promise<FullPaymentProfile> {
        const node = this.namehash(name)

        const [
            x402Endpoint,
            paymentAddress,
            supportedChains,
            agentMetadata,
            paymentEnabled,
        ] = await Promise.all([
            this.getX402Endpoint(name),
            this.getPaymentAddress(name, chainId),
            this.getSupportedChains(name),
            this.getAgentMetadata(name),
            this.isPaymentEnabled(name),
        ])

        return {
            x402Endpoint,
            paymentAddress,
            supportedChains: supportedChains.map(Number),
            agentMetadata,
            paymentEnabled,
        }
    }

    // ================================================================
    // On-Chain: Account Abstraction (ERC-4337)
    // ================================================================

    /**
     * Predict the deterministic address for an AA wallet
     */
    async predictWalletAddress(owner: Address, salt: bigint = 0n): Promise<Address> {
        return await this.publicClient.readContract({
            address: this.config.accountFactory,
            abi: AgentAccountFactoryAbi,
            functionName: 'getAddress',
            args: [owner, salt],
        })
    }

    /**
     * Get the current nonce for an AA wallet from EntryPoint
     */
    async getEntryPointNonce(sender: Address): Promise<bigint> {
        return await this.publicClient.readContract({
            address: this.config.entryPoint,
            abi: EntryPointAbi,
            functionName: 'getNonce',
            args: [sender, 0n],
        })
    }

    // ================================================================
    // On-Chain: Resolver Record Functions
    // ================================================================

    /**
     * Get a text record for a domain
     */
    async getText(name: string, key: string): Promise<string> {
        const node = this.namehash(name)
        return await this.publicClient.readContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'text',
            args: [node, key],
        })
    }

    /**
     * Set a text record for a domain
     */
    async setText(name: string, key: string, value: string): Promise<Hash> {
        if (!this.walletClient) {
            throw new Error('WalletClient required for write operations')
        }

        const [account] = await this.walletClient.getAddresses()
        const node = this.namehash(name)

        return await this.walletClient.writeContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'setText',
            args: [node, key, value],
            account,
            chain: this.chainId === 8453 ? base : baseSepolia,
        })
    }

    /**
     * Set the address record for a domain
     */
    async setAddr(name: string, addr: Address): Promise<Hash> {
        if (!this.walletClient) {
            throw new Error('WalletClient required for write operations')
        }

        const [account] = await this.walletClient.getAddresses()
        const node = this.namehash(name)

        return await this.walletClient.writeContract({
            address: this.config.resolver,
            abi: AgentPublicResolverAbi,
            functionName: 'setAddr',
            args: [node, addr],
            account,
            chain: this.chainId === 8453 ? base : baseSepolia,
        })
    }

    // ================================================================
    // On-Chain: Utility Functions
    // ================================================================

    /**
     * Get the owner of a domain
     */
    async getOwner(name: string): Promise<Address> {
        const node = this.namehash(name)
        return await this.publicClient.readContract({
            address: this.config.nameWrapper,
            abi: NameWrapperAbi,
            functionName: 'ownerOf',
            args: [BigInt(node)],
        })
    }

    /**
     * Calculate the namehash for a full domain (e.g., "myname.id")
     */
    namehash(name: string): Hash {
        const fullName = name.endsWith(`.${TLD}`) ? name : `${name}.${TLD}`
        return namehash(fullName)
    }

    /**
     * Calculate the labelhash for a label (without TLD)
     */
    labelhash(label: string): Hash {
        return labelhash(label)
    }

    /**
     * Get the full domain name with TLD
     */
    getFullName(name: string): string {
        return name.endsWith(`.${TLD}`) ? name : `${name}.${TLD}`
    }

    // ================================================================
    // API: Price & Availability
    // ================================================================

    /**
     * Get price and availability via API
     * Does not require walletClient
     */
    async apiGetPrice(name: string): Promise<ApiPriceResponse> {
        return this.apiFetch<ApiPriceResponse>(`/api/price?name=${encodeURIComponent(name)}`)
    }

    // ================================================================
    // API: Standard Registration (ETH payment)
    // ================================================================

    /**
     * Register a domain via API
     * Returns transaction data that the agent must sign and broadcast
     *
     * @example
     * ```typescript
     * const result = await sdk.apiRegister('my-trading-bot', '0x1234...')
     * // Sign and send result.transaction with your wallet
     * ```
     */
    async apiRegister(
        name: string,
        owner: Address,
        options: {
            reverseRecord?: boolean
            textRecords?: Record<string, string>
        } = {},
    ): Promise<ApiRegisterResponse> {
        return this.apiFetch<ApiRegisterResponse>('/api/register', {
            method: 'POST',
            body: {
                name,
                owner,
                reverseRecord: options.reverseRecord ?? false,
                textRecords: options.textRecords ?? {},
            },
        })
    }

    // ================================================================
    // API: Batch Registration
    // ================================================================

    /**
     * Register multiple domains in a single transaction via API
     * Max 50 names per batch
     *
     * @example
     * ```typescript
     * const result = await sdk.apiBatchRegister(
     *   ['bot-1', 'bot-2', 'bot-3'],
     *   '0x1234...'
     * )
     * // Sign and send result.transaction
     * ```
     */
    async apiBatchRegister(names: string[], owner: Address): Promise<ApiBatchRegisterResponse> {
        return this.apiFetch<ApiBatchRegisterResponse>('/api/register/batch', {
            method: 'POST',
            body: { names, owner },
        })
    }

    // ================================================================
    // API: Relay Registration (non-native agents, USDC + UserOp)
    // ================================================================

    /**
     * Relay registration for non-native agents (Claude, GPT, etc.)
     *
     * Step 1: Call without signature to get unsigned UserOp
     * Step 2: Sign the UserOp hash
     * Step 3: Call again with the signature to submit
     *
     * @example
     * ```typescript
     * // Step 1: Get unsigned UserOp
     * const step1 = await sdk.apiRelay('my-agent', '0x1234...')
     * // step1.userOp contains the UserOp to sign
     *
     * // Step 2: Sign the UserOp hash with your wallet
     *
     * // Step 3: Submit with signature
     * const step2 = await sdk.apiRelay('my-agent', '0x1234...', {
     *   signature: '0xsigned...',
     *   paymasterPermit: '0xpaymasterPermit...',
     * })
     * ```
     */
    async apiRelay(
        name: string,
        owner: Address,
        options: RelayOptions = {},
    ): Promise<ApiRelayResponse> {
        return this.apiFetch<ApiRelayResponse>('/api/register/relay', {
            method: 'POST',
            body: {
                name,
                owner,
                deployWallet: options.deployWallet ?? false,
                walletSalt: options.walletSalt ?? Date.now(),
                textRecords: options.textRecords ?? {},
                permit: options.permit,
                paymasterPermit: options.paymasterPermit,
                signature: options.signature,
            },
        })
    }

    // ================================================================
    // API: Build UserOp (autonomous agents)
    // ================================================================

    /**
     * Build an unsigned UserOp for an autonomous agent with an AA wallet
     *
     * Returns everything the agent needs to:
     * 1. Get paymasterAndData from Circle Paymaster
     * 2. Sign the UserOp hash
     * 3. Submit via apiSubmitUserOp()
     *
     * @example
     * ```typescript
     * const result = await sdk.apiBuildUserOp('my-agent', '0xAAWallet...')
     * // 1. Get paymaster data from Circle
     * // 2. Sign the userOpHash
     * // 3. Submit: await sdk.apiSubmitUserOp(signedUserOp)
     * ```
     */
    async apiBuildUserOp(
        name: string,
        sender: Address,
        options: BuildUserOpOptions = {},
    ): Promise<ApiBuildUserOpResponse> {
        return this.apiFetch<ApiBuildUserOpResponse>('/api/register/build-userop', {
            method: 'POST',
            body: {
                name,
                sender,
                deployWallet: options.deployWallet ?? false,
                walletSalt: options.walletSalt ?? 0,
                textRecords: options.textRecords ?? {},
            },
        })
    }

    // ================================================================
    // API: Submit Signed UserOp (autonomous agents)
    // ================================================================

    /**
     * Submit a fully signed UserOp to the bundler
     *
     * @example
     * ```typescript
     * const result = await sdk.apiSubmitUserOp(signedUserOp)
     * console.log('UserOp hash:', result.userOpHash)
     * ```
     */
    async apiSubmitUserOp(userOp: UserOperation): Promise<ApiAutonomousResponse> {
        return this.apiFetch<ApiAutonomousResponse>('/api/register/autonomous', {
            method: 'POST',
            body: { userOp },
        })
    }

    // ================================================================
    // API: Payment Configuration (x402 / ERC-8004)
    // ================================================================

    /**
     * Configure payment profile for a domain via API
     * Returns transactions that the owner must sign
     *
     * @example
     * ```typescript
     * const result = await sdk.apiConfigurePayment('my-agent', {
     *   x402Endpoint: 'https://api.myagent.com/x402',
     *   paymentAddress: '0x1234...',
     *   supportedChains: [8453, 1],
     *   agentMetadataURI: 'ipfs://...',
     *   enabled: true,
     * })
     * // Sign and send each transaction in result.transactions
     * ```
     */
    async apiConfigurePayment(
        name: string,
        config: PaymentConfig,
    ): Promise<ApiConfigurePaymentResponse> {
        return this.apiFetch<ApiConfigurePaymentResponse>('/api/configure-payment', {
            method: 'POST',
            body: {
                name,
                x402Endpoint: config.x402Endpoint,
                agentMetadata: config.agentMetadataURI,
                paymentEnabled: config.enabled,
                paymentAddress: config.paymentAddress,
                supportedChains: config.supportedChains,
            },
        })
    }

    // ================================================================
    // API: Get Payment Profile
    // ================================================================

    /**
     * Get the x402/ERC-8004 payment profile for a domain via API
     */
    async apiGetPaymentProfile(name: string): Promise<ApiPaymentProfileResponse> {
        const cleanName = name.replace('.id', '')
        return this.apiFetch<ApiPaymentProfileResponse>(`/api/x402/${encodeURIComponent(cleanName)}`)
    }

    // ================================================================
    // API: Referral System
    // ================================================================

    /**
     * Generate a referral for a registration
     *
     * @param referralCode - The referrer's domain name (without .id)
     * @param registrantAddress - Address of the person registering
     * @param name - Name being registered
     */
    async apiGenerateReferral(
        referralCode: string,
        registrantAddress: Address,
        name: string,
    ): Promise<ReferralGenerateResponse> {
        return this.apiFetch<ReferralGenerateResponse>('/api/referral/generate', {
            method: 'POST',
            body: { referralCode, registrantAddress, name },
        })
    }

    /**
     * Validate a referral code (checks if domain exists and is not expired)
     */
    async apiValidateReferral(code: string): Promise<ReferralValidateResponse> {
        return this.apiFetch<ReferralValidateResponse>(
            `/api/referral/validate/${encodeURIComponent(code)}`,
        )
    }

    // ================================================================
    // API: Premium Names & Auctions
    // ================================================================

    /**
     * Check if a name is premium and requires auction
     */
    async apiGetPremiumInfo(name: string): Promise<PremiumInfo> {
        const cleanName = name.replace('.id', '')
        return this.apiFetch<PremiumInfo>(`/api/premium/${encodeURIComponent(cleanName)}`)
    }

    /**
     * Get active/ended auctions
     *
     * @param status - Filter by status: 'active' | 'ended' | 'all'
     */
    async apiGetAuctions(status: 'active' | 'ended' | 'all' = 'active'): Promise<{ auctions: AuctionInfo[] }> {
        return this.apiFetch<{ auctions: AuctionInfo[] }>(`/api/auctions?status=${status}`)
    }

    /**
     * Get a specific auction by ID
     */
    async apiGetAuction(id: number): Promise<{ auction: AuctionInfo }> {
        return this.apiFetch<{ auction: AuctionInfo }>(`/api/auctions?id=${id}`)
    }

    // ================================================================
    // API: Convenience Methods
    // ================================================================

    /**
     * Register with a referral code (convenience method)
     *
     * Generates referral data and returns transaction with referral applied.
     *
     * @example
     * ```typescript
     * const result = await sdk.apiRegisterWithReferral(
     *   'my-agent',
     *   '0x1234...',
     *   'friend-domain'
     * )
     * ```
     */
    async apiRegisterWithReferral(
        name: string,
        owner: Address,
        referralCode: string,
        options: {
            reverseRecord?: boolean
            textRecords?: Record<string, string>
        } = {},
    ): Promise<ApiRegisterResponse & { referral: ReferralGenerateResponse }> {
        // First generate the referral
        const referral = await this.apiGenerateReferral(referralCode, owner, name)

        // Then register with it
        const result = await this.apiRegister(name, owner, options)

        return { ...result, referral }
    }

    // ================================================================
    // Internal: API Fetch Helper
    // ================================================================

    private async apiFetch<T>(path: string, options?: { method?: string; body?: any }): Promise<T> {
        if (!this.apiBaseUrl) {
            throw new Error('apiBaseUrl required for API calls. Set it in SafuDomainsConfig.')
        }

        const url = `${this.apiBaseUrl}${path}`
        const fetchOptions: RequestInit = {
            method: options?.method || 'GET',
            headers: { 'Content-Type': 'application/json' },
        }

        if (options?.body) {
            fetchOptions.body = JSON.stringify(options.body)
        }

        const response = await fetch(url, fetchOptions)
        const data = await response.json()

        if (!response.ok) {
            throw new Error(data.error || `API request failed: ${response.status}`)
        }

        return data as T
    }
}
