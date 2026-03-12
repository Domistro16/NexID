
import { createPublicClient, http, namehash } from 'viem';
import { base } from 'viem/chains';
import { AgentPublicResolverAbi } from '../sdk/src/abis';
import { CONSTANTS_MAINNET } from '../frontend/constant';

const client = createPublicClient({
    chain: base,
    transport: http(),
});

const RESOLVER_ADDRESS = CONSTANTS_MAINNET.PublicResolver;
const NAME = 'antigravity_debug.id';
const NODE = namehash(NAME);

async function main() {
    console.log(`Checking Resolver at ${RESOLVER_ADDRESS} for node ${NODE}`);

    const calls: { name: string; args: readonly any[] }[] = [
        { name: 'paymentAddress', args: [NODE, 8453n] },
    ];

    for (const call of calls) {
        try {
            console.log(`Calling ${call.name}...`);
            // Set a timeout for the request to avoid hanging indefinitely if RPC is weird
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
