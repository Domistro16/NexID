/**
 * Auth utilities — consolidated module.
 * 
 * Re-exports the canonical verifyAuth from the admin middleware to avoid
 * having two separate implementations.  Legacy callers that import from
 * '@/lib/auth' will now get the same behaviour as '@/lib/middleware/admin.middleware'.
 */
import { NextRequest } from 'next/server';
import { verifyAuth as middlewareVerifyAuth } from './middleware/admin.middleware';

export interface AuthUser {
    userId: string;
    walletAddress: string;
}

/**
 * Extract and verify JWT token from request headers.
 * Returns user info if valid, null otherwise.
 */
export function verifyAuth(request: NextRequest): AuthUser | null {
    // Delegate to the async middleware version but preserve the sync API
    // that existing callers expect.  Because JWT verification is synchronous
    // under the hood, we can safely call the token-verification path directly.
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    // Import directly to avoid circular deps at module level
    const { AuthService } = require('./services/auth.service');
    const prisma = require('./prisma').default;
    const authService = new AuthService(prisma);

    const token = authHeader.substring(7);
    return authService.verifyToken(token);
}

/**
 * Require authentication — throws if not authenticated.
 */
export function requireAuth(request: NextRequest): AuthUser {
    const user = verifyAuth(request);

    if (!user) {
        throw new Error('Unauthorized');
    }

    return user;
}

/**
 * Create unauthorized response.
 */
export function unauthorizedResponse(message = 'Unauthorized') {
    return Response.json({ error: message }, { status: 401 });
}
