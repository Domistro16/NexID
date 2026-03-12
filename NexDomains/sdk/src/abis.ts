// ============ AgentPriceOracle ABI ============
export const AgentPriceOracleAbi = [
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'getPrice',
        outputs: [
            {
                components: [
                    { name: 'priceWei', type: 'uint256' },
                    { name: 'priceUsd', type: 'uint256' },
                    { name: 'isAgentName', type: 'bool' },
                ],
                type: 'tuple',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'isAgentName',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'getPatternMatchCount',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'pure',
        type: 'function',
    },
] as const

// ============ AgentRegistrarController ABI ============
export const AgentRegistrarControllerAbi = [
    {
        inputs: [],
        name: 'owner',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'available',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'name', type: 'string' }],
        name: 'rentPrice',
        outputs: [
            { name: 'priceWei', type: 'uint256' },
            { name: 'priceUsd', type: 'uint256' },
            { name: 'isAgentName', type: 'bool' },
        ],
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
        inputs: [{ name: 'commitment', type: 'bytes32' }],
        name: 'commit',
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
        name: 'makeCommitment',
        outputs: [{ name: '', type: 'bytes32' }],
        stateMutability: 'pure',
        type: 'function',
    },
    {
        inputs: [{ name: 'commitment', type: 'bytes32' }],
        name: 'commitments',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'name', type: 'string' },
            { name: 'owner', type: 'address' },
        ],
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
] as const

// ============ AgentPublicResolver ABI (x402 / ERC-8004) ============
export const AgentPublicResolverAbi = [
    // x402 Protocol
    {
        inputs: [{ name: 'node', type: 'bytes32' }],
        name: 'x402Endpoint',
        outputs: [{ name: '', type: 'string' }],
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
    // ERC-8004 Payment Address
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'chainId', type: 'uint256' },
        ],
        name: 'paymentAddress',
        outputs: [{ name: '', type: 'address' }],
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
    // Supported Chains
    {
        inputs: [{ name: 'node', type: 'bytes32' }],
        name: 'supportedChains',
        outputs: [{ name: '', type: 'uint256[]' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'chainIds', type: 'uint256[]' },
        ],
        name: 'setSupportedChains',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // Agent Metadata
    {
        inputs: [{ name: 'node', type: 'bytes32' }],
        name: 'agentMetadata',
        outputs: [{ name: '', type: 'string' }],
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
    // Payment Enabled
    {
        inputs: [{ name: 'node', type: 'bytes32' }],
        name: 'paymentEnabled',
        outputs: [{ name: '', type: 'bool' }],
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
    // Standard ENS resolver functions
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'coinType', type: 'uint256' },
        ],
        name: 'addr',
        outputs: [{ name: '', type: 'bytes' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'node', type: 'bytes32' },
            { name: 'key', type: 'string' },
        ],
        name: 'text',
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
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

// ============ NameWrapper ABI ============
export const NameWrapperAbi = [
    {
        inputs: [{ name: 'id', type: 'uint256' }],
        name: 'ownerOf',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const

// ============ AgentAccountFactory ABI ============
export const AgentAccountFactoryAbi = [
    {
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'salt', type: 'uint256' },
        ],
        name: 'getAddress',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'salt', type: 'uint256' },
        ],
        name: 'createAccount',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const

// ============ EntryPoint ABI (v0.6) ============
export const EntryPointAbi = [
    {
        inputs: [
            { name: 'sender', type: 'address' },
            { name: 'key', type: 'uint192' },
        ],
        name: 'getNonce',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const

// ============ SimpleAgentAccount ABI ============
export const SimpleAgentAccountAbi = [
    {
        inputs: [
            { name: 'dest', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'func', type: 'bytes' },
        ],
        name: 'execute',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'dest', type: 'address[]' },
            { name: 'value', type: 'uint256[]' },
            { name: 'func', type: 'bytes[]' },
        ],
        name: 'executeBatch',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'owner',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const
