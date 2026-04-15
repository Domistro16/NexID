import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAddress } from 'viem';
import prisma from '@/lib/prisma';
import { AuthService } from '@/lib/services/auth.service';
import { getPrivyServerClient } from '@/lib/privy-server';

const authService = new AuthService(prisma);

const schema = z.object({
    privyAccessToken: z.string().min(1, 'Privy access token required'),
    // Optional: when the client knows exactly which linked wallet should own
    // the backend session (external-wallet flow). The address MUST be one of
    // the user's verified linked wallets — we never trust a raw claim.
    walletAddress: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address')
        .optional(),
});

type LinkedWalletLite = {
    address?: string;
    chainType?: string;
};

function pickEthereumWalletAddress(
    user: { wallet?: LinkedWalletLite; linkedAccounts?: Array<{ type?: string } & LinkedWalletLite> },
    desired: string | null,
): string | null {
    const accounts = user.linkedAccounts ?? [];
    const ethWallets = accounts.filter(
        (acc) => acc?.type === 'wallet' && acc?.chainType === 'ethereum' && typeof acc.address === 'string',
    );

    if (desired) {
        const match = ethWallets.find(
            (w) => typeof w.address === 'string' && w.address.toLowerCase() === desired.toLowerCase(),
        );
        return match?.address ?? null;
    }

    if (user.wallet?.address && user.wallet.chainType === 'ethereum') {
        return user.wallet.address;
    }
    return ethWallets[0]?.address ?? null;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { privyAccessToken, walletAddress } = schema.parse(body);

        const privy = getPrivyServerClient();

        // 1. Verify the Privy access token cryptographically.
        let claims;
        try {
            claims = await privy.verifyAuthToken(privyAccessToken);
        } catch {
            return NextResponse.json({ error: 'Invalid Privy session' }, { status: 401 });
        }

        // 2. Load the verified Privy user to inspect linked wallets.
        let privyUser;
        try {
            privyUser = await privy.getUserById(claims.userId);
        } catch (err) {
            console.error('Privy getUserById failed', err);
            return NextResponse.json({ error: 'Failed to load Privy user' }, { status: 502 });
        }

        const rawAddress = pickEthereumWalletAddress(privyUser, walletAddress ?? null);
        if (!rawAddress) {
            return NextResponse.json(
                {
                    error: walletAddress
                        ? 'Requested wallet is not linked to this Privy account'
                        : 'No Ethereum wallet linked to this Privy account',
                },
                { status: 403 },
            );
        }

        // Canonicalize: always store lowercase in DB, return checksummed for display.
        const checksummed = getAddress(rawAddress);
        const lower = checksummed.toLowerCase();

        // 3. Find-or-create our User record, then mint our backend JWT.
        let user = await prisma.user.findUnique({ where: { walletAddress: lower } });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    walletAddress: lower,
                    nonce: authService.generateNonce(),
                },
            });
        }

        const token = authService.generateToken(user.id, lower);
        const safeUser = await authService.getUserById(user.id);

        return NextResponse.json({ token, user: safeUser });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
        }
        console.error('Privy verify error:', error);
        return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
    }
}
