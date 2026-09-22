import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { seedGames } from './game';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://run-mishe:run-mishe@localhost:55432/run-mishe';
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

async function main() {
  const before = await prisma.game.count();
  await seedGames(prisma);
  const after = await prisma.game.count();
  const offList = await prisma.game.count({
    where: {
      NOT: {
        OR: [
          { sourceName: { contains: 'Steam' } },
          { sourceName: 'Curated allowlist' },
        ],
      },
    },
  });
  console.log(JSON.stringify({ before, after, offList }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
