import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const auth = verifyAuth(request);
        if (!auth) {
            return unauthorizedResponse();
        }

        const transactions = await prisma.blockchainTx.findMany({
            where: { userId: auth.userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        return NextResponse.json({ transactions });
    } catch (error) {
        console.error('Transactions fetch error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch transactions' },
            { status: 500 }
        );
    }
}
