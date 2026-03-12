// NexID v2 ABIs

// ============ Resolver ABI (shared) ============
export const ResolverABI = [
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'addr', type: 'address' },
        ],
        name: 'setAddr',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'key', type: 'string' },
            { name: 'value', type: 'string' },
        ],
        name: 'setText',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const

// ============ AgentRegistrarController AA-specific ABI (USDC + ERC-4337 subset) ============
// Used by API routes that only need the AA registration functions
export const AgentRegistrarControllerV2ABI = [
    {
        inputs: [
            {
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'bool' },
                    { name: 'ownerControlledFuses', type: 'uint16' },
                    { name: 'deployWallet', type: 'bool' },
                    { name: 'walletSalt', type: 'uint256' },
                ],
                name: 'req',
                type: 'tuple',
            },
        ],
        name: 'register',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'bool' },
                    { name: 'ownerControlledFuses', type: 'uint16' },
                    { name: 'deployWallet', type: 'bool' },
                    { name: 'walletSalt', type: 'uint256' },
                ],
                name: 'req',
                type: 'tuple',
            },
            {
                components: [
                    { name: 'referrer', type: 'address' },
                    { name: 'registrant', type: 'address' },
                    { name: 'nameHash', type: 'bytes32' },
                    { name: 'referrerCodeHash', type: 'bytes32' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' },
                ],
                name: 'referralData',
                type: 'tuple',
            },
            { name: 'referralSignature', type: 'bytes' },
        ],
        name: 'registerWithUSDC',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'bool' },
                    { name: 'ownerControlledFuses', type: 'uint16' },
                    { name: 'deployWallet', type: 'bool' },
                    { name: 'walletSalt', type: 'uint256' },
                ],
                name: 'req',
                type: 'tuple',
            },
            {
                components: [
                    { name: 'deadline', type: 'uint256' },
                    { name: 'v', type: 'uint8' },
                    { name: 'r', type: 'bytes32' },
                    { name: 's', type: 'bytes32' },
                ],
                name: 'permit',
                type: 'tuple',
            },
            {
                components: [
                    { name: 'referrer', type: 'address' },
                    { name: 'registrant', type: 'address' },
                    { name: 'nameHash', type: 'bytes32' },
                    { name: 'referrerCodeHash', type: 'bytes32' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' },
                ],
                name: 'referralData',
                type: 'tuple',
            },
            { name: 'referralSignature', type: 'bytes' },
        ],
        name: 'registerWithPermit',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'bool' },
                    { name: 'ownerControlledFuses', type: 'uint16' },
                    { name: 'deployWallet', type: 'bool' },
                    { name: 'walletSalt', type: 'uint256' },
                ],
                name: 'requests',
                type: 'tuple[]',
            },
        ],
        name: 'batchRegister',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'available',
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'getPrice',
        outputs: [
            { name: 'priceUSDC', type: 'uint256' },
            { name: 'isAgentName', type: 'bool' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'salt', type: 'uint256' },
        ],
        name: 'getWalletAddress',
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'commitment', type: 'bytes32' }],
        name: 'commit',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalRegistrations',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalAgentRegistrations',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalVolumeUSDC',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const

// ============ AgentAccountFactory ============
export const AgentAccountFactoryABI = [
    {
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'salt', type: 'uint256' },
        ],
        name: 'createAccount',
        outputs: [{ type: 'address' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'salt', type: 'uint256' },
        ],
        name: 'getAddress',
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const

// ============ AgentPriceOracle ============
export const AgentPriceOracleABI = [
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'getPrice',
        outputs: [
            { name: 'priceWei', type: 'uint256' },
            { name: 'priceUsd', type: 'uint256' },
            { name: 'isAgentName', type: 'bool' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'isAgentName',
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const

// ============ AgentRegistrarController (with AA + USDC support) ============
export const AgentRegistrarControllerABI = [
    // Ownable
    {
        inputs: [],
        name: 'owner',
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'bool' },
                    { name: 'ownerControlledFuses', type: 'uint16' },
                    { name: 'deployWallet', type: 'bool' },
                    { name: 'walletSalt', type: 'uint256' },
                ],
                name: 'request',
                type: 'tuple',
            },
            {
                components: [
                    { name: 'referrer', type: 'address' },
                    { name: 'registrant', type: 'address' },
                    { name: 'nameHash', type: 'bytes32' },
                    { name: 'referrerCodeHash', type: 'bytes32' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' },
                ],
                name: 'referralData',
                type: 'tuple',
            },
            { name: 'signature', type: 'bytes' },
        ],
        name: 'register',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'bool' },
                    { name: 'ownerControlledFuses', type: 'uint16' },
                    { name: 'deployWallet', type: 'bool' },
                    { name: 'walletSalt', type: 'uint256' },
                ],
                name: 'req',
                type: 'tuple',
            },
            {
                components: [
                    { name: 'referrer', type: 'address' },
                    { name: 'registrant', type: 'address' },
                    { name: 'nameHash', type: 'bytes32' },
                    { name: 'referrerCodeHash', type: 'bytes32' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' },
                ],
                name: 'referralData',
                type: 'tuple',
            },
            { name: 'referralSignature', type: 'bytes' },
        ],
        name: 'registerWithUSDC',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'bool' },
                    { name: 'ownerControlledFuses', type: 'uint16' },
                    { name: 'deployWallet', type: 'bool' },
                    { name: 'walletSalt', type: 'uint256' },
                ],
                name: 'req',
                type: 'tuple',
            },
            {
                components: [
                    { name: 'deadline', type: 'uint256' },
                    { name: 'v', type: 'uint8' },
                    { name: 'r', type: 'bytes32' },
                    { name: 's', type: 'bytes32' },
                ],
                name: 'permit',
                type: 'tuple',
            },
            {
                components: [
                    { name: 'referrer', type: 'address' },
                    { name: 'registrant', type: 'address' },
                    { name: 'nameHash', type: 'bytes32' },
                    { name: 'referrerCodeHash', type: 'bytes32' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' },
                ],
                name: 'referralData',
                type: 'tuple',
            },
            { name: 'referralSignature', type: 'bytes' },
        ],
        name: 'registerWithPermit',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'bool' },
                    { name: 'ownerControlledFuses', type: 'uint16' },
                    { name: 'deployWallet', type: 'bool' },
                    { name: 'walletSalt', type: 'uint256' },
                ],
                name: 'requests',
                type: 'tuple[]',
            },
        ],
        name: 'batchRegister',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'bool' },
                    { name: 'ownerControlledFuses', type: 'uint16' },
                    { name: 'deployWallet', type: 'bool' },
                    { name: 'walletSalt', type: 'uint256' },
                ],
                name: 'requests',
                type: 'tuple[]',
            },
        ],
        name: 'batchRegisterWithUSDC',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'available',
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'getPrice',
        outputs: [
            { name: 'priceUSDC', type: 'uint256' },
            { name: 'isAgentName', type: 'bool' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'salt', type: 'uint256' },
        ],
        name: 'getWalletAddress',
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'commitment', type: 'bytes32' }],
        name: 'commit',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Reserved names
    {
        inputs: [{ name: 'name', type: 'string' }, { name: 'owner', type: 'address' }],
        name: 'reserveName',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'names', type: 'string[]' },
            { name: 'owners', type: 'address[]' },
        ],
        name: 'reserveNamesBatch',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'clearReservation',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'owner', type: 'address' },
                    { name: 'secret', type: 'bytes32' },
                    { name: 'resolver', type: 'address' },
                    { name: 'data', type: 'bytes[]' },
                    { name: 'reverseRecord', type: 'bool' },
                    { name: 'ownerControlledFuses', type: 'uint16' },
                    { name: 'deployWallet', type: 'bool' },
                    { name: 'walletSalt', type: 'uint256' },
                ],
                name: 'req',
                type: 'tuple',
            },
        ],
        name: 'mintReserved',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalMints',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalAgentRegistrations',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalVolumeUSDC',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const

// ============ AgentPublicResolver (x402/ERC-8004) ============
export const AgentPublicResolverABI = [
    // x402 Endpoint
    {
        inputs: [{ name: 'node', type: 'bytes32' }],
        name: 'x402Endpoint',
        outputs: [{ type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'endpoint', type: 'string' },
        ],
        name: 'setX402Endpoint',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Payment address
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'chainId', type: 'uint256' },
        ],
        name: 'paymentAddress',
        outputs: [{ type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'chainId', type: 'uint256' },
            { name: 'addr', type: 'address' },
        ],
        name: 'setPaymentAddress',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Supported chains
    {
        inputs: [{ name: 'node', type: 'bytes32' }],
        name: 'supportedChains',
        outputs: [{ type: 'uint256[]' }],
        stateMutability: 'view',
        type: 'function',
    },
    // Agent metadata
    {
        inputs: [{ name: 'node', type: 'bytes32' }],
        name: 'agentMetadata',
        outputs: [{ type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'uri', type: 'string' },
        ],
        name: 'setAgentMetadata',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Payment enabled
    {
        inputs: [{ name: 'node', type: 'bytes32' }],
        name: 'paymentEnabled',
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'enabled', type: 'bool' },
        ],
        name: 'setPaymentEnabled',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Standard resolver functions
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'addr', type: 'address' },
        ],
        name: 'setAddr',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'key', type: 'string' },
            { name: 'value', type: 'string' },
        ],
        name: 'setText',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const

// ============ PremiumNameRegistry ============
export const PremiumRegistryABI = [
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'isPremium',
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'getPremiumInfo',
        outputs: [
            { name: 'isPremiumName', type: 'bool' },
            { name: 'requiresAuction', type: 'bool' },
            { name: 'fixedPrice', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
] as const

// ============ IDDomainAuction ============
export const AuctionABI = [
    {
        inputs: [],
        name: 'nextAuctionId',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'auctionId', type: 'uint256' }],
        name: 'getAuction',
        outputs: [
            { name: 'name', type: 'string' },
            { name: 'reservePrice', type: 'uint256' },
            { name: 'startTime', type: 'uint256' },
            { name: 'endTime', type: 'uint256' },
            { name: 'highestBid', type: 'uint256' },
            { name: 'highestBidder', type: 'address' },
            { name: 'settled', type: 'bool' },
            { name: 'isUSDC', type: 'bool' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'hasActiveAuction',
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'auctionId', type: 'uint256' }],
        name: 'getMinBid',
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'auctionId', type: 'uint256' }],
        name: 'bid',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
    },
    {
        inputs: [{ name: 'auctionId', type: 'uint256' }],
        name: 'settle',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const

// ============ Legacy ABIs (backward compat) ============
export const registrarAbi = [
    {
        name: 'register',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            { name: 'name', type: 'string' },
            { name: 'owner', type: 'address' },
            { name: 'duration', type: 'uint256' },
            { name: 'secret', type: 'bytes32' },
            { name: 'resolver', type: 'address' },
            { name: 'data', type: 'bytes[]' },
            { name: 'reverseRecord', type: 'bool' },
            { name: 'ownerControlledFuses', type: 'uint16' },
            { name: 'lifetime', type: 'bool' },
            {
                name: 'referralData',
                type: 'tuple',
                components: [
                    { name: 'referrer', type: 'address' },
                    { name: 'registrant', type: 'address' },
                    { name: 'nameHash', type: 'bytes32' },
                    { name: 'referrerCodeHash', type: 'bytes32' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'nonce', type: 'bytes32' },
                ],
            },
            { name: 'referralSignature', type: 'bytes' },
        ],
        outputs: [],
    },
    {
        name: 'available',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'name', type: 'string' }],
        outputs: [{ type: 'bool' }],
    },
] as const
