
import { NexDomains } from '../sdk/src/client';
import { CONSTANTS_MAINNET } from '../frontend/constant';

const NAME = 'antigravity_debug.id';

async function main() {
    console.log(`Checking SDK getPaymentProfile for ${NAME}`);

    try {
        const sdk = new NexDomains({
            chainId: 8453,
            // We don't need a wallet client for reading
        });

        console.log('Fetching profile...');
        const profile = await sdk.getPaymentProfile(NAME, 8453);
        console.log('✅ Profile fetched successfully:', profile);
    } catch (e: any) {
        console.error('❌ SDK getPaymentProfile FAILED:', e);
    }
}

main().catch(console.error);
