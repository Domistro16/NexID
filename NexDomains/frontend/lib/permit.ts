import { maxUint256, erc20Abi, getContract, type PublicClient, type WalletClient } from "viem";
import { encodePacked } from 'viem'

// Adapted from Circle Paymaster Quickstart
export async function eip2612Permit({
    token,
    chain,
    ownerAddress,
    spenderAddress,
    value,
}: {
    token: any;
    chain: any;
    ownerAddress: `0x${string}`;
    spenderAddress: `0x${string}`;
    value: bigint;
}) {
    return {
        types: {
            // Required for compatibility with Circle PW Sign Typed Data API
            EIP712Domain: [
                { name: "name", type: "string" },
                { name: "version", type: "string" },
                { name: "chainId", type: "uint256" },
                { name: "verifyingContract", type: "address" },
            ],
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        },
        primaryType: "Permit" as const,
        domain: {
            name: await token.read.name(),
            version: await token.read.version(),
            chainId: BigInt(chain.id),
            verifyingContract: token.address,
        },
        message: {
            owner: ownerAddress,
            spender: spenderAddress,
            value: value.toString(), // Convert to string for EIP-712 compatibility
            nonce: (await token.read.nonces([ownerAddress])).toString(),
            // The paymaster cannot access block.timestamp due to 4337 opcode restrictions
            deadline: maxUint256.toString(),
        },
    };
}

export const eip2612Abi = [
    ...erc20Abi,
    {
        inputs: [
            {
                internalType: "address",
                name: "owner",
                type: "address",
            },
        ],
        stateMutability: "view",
        type: "function",
        name: "nonces",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256",
            },
        ],
    },
    {
        inputs: [],
        name: "version",
        outputs: [{ internalType: "string", name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
    },
] as const;

export async function signPermit({
    publicClient,
    walletClient,
    ownerAddress,
    tokenAddress,
    spenderAddress,
    value,
}: {
    publicClient: PublicClient
    walletClient: WalletClient
    ownerAddress: `0x${string}`
    tokenAddress: `0x${string}`
    spenderAddress: `0x${string}`
    value: bigint
}) {
    const token = getContract({
        client: publicClient,
        address: tokenAddress,
        abi: eip2612Abi,
    })

    const permitData = await eip2612Permit({
        token,
        chain: publicClient.chain,
        ownerAddress,
        spenderAddress,
        value,
    })

    const signature = await walletClient.signTypedData({
        account: ownerAddress,
        domain: permitData.domain as any,
        types: permitData.types,
        primaryType: permitData.primaryType,
        message: permitData.message,
    })

    return signature as `0x${string}`
}

export function buildPaymasterAndData({
    paymaster,
    usdc,
    permitAmount,
    permitSignature,
    paymasterVerificationGasLimit = 200000n,
    paymasterPostOpGasLimit = 15000n,
}: {
    paymaster: `0x${string}`
    usdc: `0x${string}`
    permitAmount: bigint
    permitSignature: `0x${string}`
    paymasterVerificationGasLimit?: bigint
    paymasterPostOpGasLimit?: bigint
}) {
    const paymasterData = encodePacked(
        ['uint8', 'address', 'uint256', 'bytes'],
        [0, usdc, permitAmount, permitSignature],
    )

    return encodePacked(
        ['address', 'uint128', 'uint128', 'bytes'],
        [paymaster, paymasterVerificationGasLimit, paymasterPostOpGasLimit, paymasterData],
    )
}
