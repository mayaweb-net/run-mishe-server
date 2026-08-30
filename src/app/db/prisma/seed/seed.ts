import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

import { seedCpus } from './hardware/cpu';
import { seedGpus } from './hardware/gpu';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://run-mishe:run-mishe@localhost:5434/run-mishe';
const adapter = new PrismaPg(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  // GPUs first: CPUs may later reference one as their integrated graphics.
  await seedGpus(prisma);
  await seedCpus(prisma);
  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
