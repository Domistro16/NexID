import { PrivyClient } from '@privy-io/server-auth';

// Singleton Privy server client. Used for verifying access tokens issued by
// the Privy client SDK and exchanging them for our own backend JWT.
//
// Required env:
//   - PRIVY_APP_ID (or NEXT_PUBLIC_PRIVY_APP_ID as fallback)
//   - PRIVY_APP_SECRET (server-only)

let cached: PrivyClient | null = null;

export function getPrivyServerClient(): PrivyClient {
    if (cached) return cached;

    const appId = process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId) {
        throw new Error('PRIVY_APP_ID (or NEXT_PUBLIC_PRIVY_APP_ID) is required');
    }
    if (!appSecret) {
        throw new Error('PRIVY_APP_SECRET is required');
    }

    cached = new PrivyClient(appId, appSecret);
    return cached;
}
