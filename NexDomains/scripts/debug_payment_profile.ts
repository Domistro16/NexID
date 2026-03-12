
import { createPublicClient, http, namehash } from 'viem';
import { base } from 'viem/chains';
import { AgentPublicResolverAbi } from '../sdk/src/abis';
import { CONSTANTS_MAINNET } from '../frontend/constant';

const client = createPublicClient({
    chain: base,
    transport: http(),
});

const RESOLVER_ADDRESS = CONSTANTS_MAINNET.PublicResolver;
// Use a random name or one we suspect exists. Since the resolver functions are view, 
// they might revert if the name doesn't exist OR/AND if the function doesn't exist.
// Ideally usage of a name that has a resolver set to this address.
// Let's assume 'safuu.id' or similar might be getting used, or just test the contract logic.
// Actually, 'paymentAddress', 'x402Endpoint' etc take a node (bytes32).
const NAME = 'antigravity_debug.id';
const NODE = namehash(NAME);

async function main() {
    console.log(`Checking Resolver at ${RESOLVER_ADDRESS} for node ${NODE}`);

    const calls: { name: string; args: readonly any[] }[] = [
        { name: 'x402Endpoint', args: [NODE] },
        { name: 'paymentEnabled', args: [NODE] },
        { name: 'agentMetadata', args: [NODE] },
        { name: 'paymentAddress', args: [NODE, 8453n] },
        // { name: 'acceptedTokens', args: [NODE, 8453n] }, // Might return array
        // { name: 'paymentLimits', args: [NODE, 8453n] }, // Might return tuple
    ];

    for (const call of calls) {
        try {
            console.log(`Calling ${call.name}...`);
            const result = await client.readContract({
                address: RESOLVER_ADDRESS,
                abi: AgentPublicResolverAbi,
                functionName: call.name as any,
                args: call.args as any,
            });
            console.log(`✅ ${call.name} success:`, result);
        } catch (e: any) {
            console.error(`❌ ${call.name} FAILED:`, e.message?.split('\n')[0] || e);
        }
    }
}

main().catch(console.error);
