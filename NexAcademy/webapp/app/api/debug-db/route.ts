import { NextResponse } from 'next/server';

/**
 * Debug endpoint removed for security.
 * Use Prisma Studio or admin endpoints to inspect database state.
 */
export async function GET() {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
