import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import { config } from '@/lib/config';

// ENS reverse registrar ABI (minimal)
const REVERSE_REGISTRAR_ABI = [
    'function node(address addr) view returns (bytes32)',
];

// ENS registry ABI (minimal)
const ENS_REGISTRY_ABI = [
    'function resolver(bytes32 node) view returns (address)',
];

// Name resolver ABI (minimal)
const NAME_RESOLVER_ABI = [
    'function name(bytes32 node) view returns (string)',
];

// SafuDomains ENS addresses (from your contracts)
const REVERSE_REGISTRAR_ADDRESS = '0x1D0831eA9486Fada3887a737E8d6f8C6Ad72a125';
const ENS_REGISTRY_ADDRESS = '0xa886B8897814193f99A88701d70b31b4a8E27a1E'; // Update with actual address

export async function GET(request: NextRequest) {
    try {
        const auth = verifyAuth(request);
        if (!auth) {
            return unauthorizedResponse();
        }

        const provider = new ethers.JsonRpcProvider(config.rpcUrl);

        // Get reverse node for the wallet address
        const reverseRegistrar = new ethers.Contract(
            REVERSE_REGISTRAR_ADDRESS,
            REVERSE_REGISTRAR_ABI,
            provider
        );

        let hasDomain = false;
        let domainName: string | null = null;

        try {
            // Get the node for this address
            const node = await reverseRegistrar.node(auth.walletAddress);

            // Get the resolver for this node
            const ensRegistry = new ethers.Contract(
                ENS_REGISTRY_ADDRESS,
                ENS_REGISTRY_ABI,
                provider
            );

            const resolverAddress = await ensRegistry.resolver(node);

            if (resolverAddress && resolverAddress !== ethers.ZeroAddress) {
                // Get the name from the resolver
                const nameResolver = new ethers.Contract(
                    resolverAddress,
                    NAME_RESOLVER_ABI,
                    provider
                );

                const name = await nameResolver.name(node);

                if (name && name.endsWith('.id')) {
                    hasDomain = true;
                    domainName = name;
                }
            }
        } catch (err) {
            // No domain set or error reading - that's okay
            console.log('Domain check error (expected if no domain):', err);
        }

        return NextResponse.json({
            hasDomain,
            domainName,
            walletAddress: auth.walletAddress,
            registerUrl: hasDomain ? null : 'https://names.idverse.com',
        });
    } catch (error) {
        console.error('Domain status error:', error);
        return NextResponse.json(
            { error: 'Failed to check domain status' },
            { status: 500 }
        );
    }
}
