import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '../services/auth.service';
import { config } from '../config';
import prisma from '../prisma';

const authService = new AuthService(prisma);

export interface AdminRequest extends NextRequest {
    user?: {
        userId: string;
        walletAddress: string;
        isAdmin: boolean;
    };
}

/**
 * Verify that the request is from an authenticated admin user
 * Admin status is determined by:
 * 1. User has isAdmin = true in database, OR
 * 2. User's wallet address is in ADMIN_ADDRESSES env var
 */
export async function verifyAdmin(request: NextRequest): Promise<{
    authorized: boolean;
    user?: { userId: string; walletAddress: string; isAdmin: boolean };
    error?: string;
}> {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { authorized: false, error: 'Missing or invalid authorization header' };
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const decoded = authService.verifyToken(token);
    if (!decoded) {
        return { authorized: false, error: 'Invalid or expired token' };
    }

    // Check if user exists and get admin status
    const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, walletAddress: true, isAdmin: true },
    });

    if (!user) {
        return { authorized: false, error: 'User not found' };
    }

    // Check admin status: either isAdmin flag or in admin addresses list
    const isInAdminList = config.adminAddresses.includes(user.walletAddress.toLowerCase());
    const isAdmin = user.isAdmin || isInAdminList;

    if (!isAdmin) {
        return { authorized: false, error: 'Admin access required' };
    }

    return {
        authorized: true,
        user: {
            userId: user.id,
            walletAddress: user.walletAddress,
            isAdmin: true,
        },
    };
}

/**
 * Higher-order function to wrap API route handlers with admin auth
 */
export function withAdminAuth(
    handler: (
        request: NextRequest,
        user: { userId: string; walletAddress: string; isAdmin: boolean },
        context?: { params: Record<string, string> }
    ) => Promise<NextResponse>
) {
    return async (request: NextRequest, context?: { params: Record<string, string> }) => {
        const result = await verifyAdmin(request);

        if (!result.authorized) {
            return NextResponse.json(
                { error: result.error },
                { status: result.error === 'Admin access required' ? 403 : 401 }
            );
        }

        return handler(request, result.user!, context);
    };
}

/**
 * Verify a regular authenticated user (not admin)
 */
export async function verifyAuth(request: NextRequest): Promise<{
    authorized: boolean;
    user?: { userId: string; walletAddress: string };
    error?: string;
}> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { authorized: false, error: 'Missing or invalid authorization header' };
    }

    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);

    if (!decoded) {
        return { authorized: false, error: 'Invalid or expired token' };
    }

    return {
        authorized: true,
        user: {
            userId: decoded.userId,
            walletAddress: decoded.walletAddress,
        },
    };
}

/**
 * Higher-order function to wrap API route handlers with regular auth
 */
export function withAuth(
    handler: (
        request: NextRequest,
        user: { userId: string; walletAddress: string },
        context?: { params: Record<string, string> }
    ) => Promise<NextResponse>
) {
    return async (request: NextRequest, context?: { params: Record<string, string> }) => {
        const result = await verifyAuth(request);

        if (!result.authorized) {
            return NextResponse.json({ error: result.error }, { status: 401 });
        }

        return handler(request, result.user!, context);
    };
}
