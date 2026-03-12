import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { AuthService } from '@/lib/services/auth.service';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';

const authService = new AuthService(prisma);

export async function GET(request: NextRequest) {
    try {
        const auth = verifyAuth(request);

        if (!auth) {
            return unauthorizedResponse('Not authenticated');
        }

        const user = await authService.getUserById(auth.userId);

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ user });
    } catch (error) {
        console.error('Auth me error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
