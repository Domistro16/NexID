import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updatePoints() {
    const result = await prisma.user.update({
        where: { walletAddress: '0xd83defba240568040b39bb2c8b4db7db02d40593' },
        data: { totalPoints: 320 },
    });
    console.log(`Updated ${result.walletAddress} to ${result.totalPoints} points`);
}

updatePoints()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
