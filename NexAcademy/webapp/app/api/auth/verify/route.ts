import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { AuthService } from '@/lib/services/auth.service';

const authService = new AuthService(prisma);

const verifySchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  signature: z.string().min(1, 'Signature required'),
  message: z.string().min(1, 'Message required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, signature, message } = verifySchema.parse(body);

    const result = await authService.verifySignature(walletAddress, signature, message);

    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const user = await authService.getUserById(result.userId!);

    return NextResponse.json({
      token: result.token,
      user,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 401 }
    );
  }
}
