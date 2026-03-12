import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { AuthService } from '@/lib/services/auth.service';

const authService = new AuthService(prisma);

const getNonceSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = getNonceSchema.parse(body);

    const nonce = await authService.getNonceForWallet(walletAddress);
    const timestamp = Math.floor(Date.now() / 1000);
    const message = authService.createSignMessage(walletAddress.toLowerCase(), nonce, timestamp);

    return NextResponse.json({ message, timestamp });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    console.error('Nonce generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
