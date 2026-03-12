import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { RelayerService } from '@/lib/services';

export async function GET() {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    // Check relayer setup
    const relayerService = new RelayerService(prisma);
    const relayerCheck = await relayerService.verifyRelayerSetup();

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      relayer: relayerCheck.valid ? 'configured' : 'error',
      relayerError: relayerCheck.error,
      relayerAddress: await relayerService.getRelayerAddress(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
