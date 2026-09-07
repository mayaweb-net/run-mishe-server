import 'dotenv/config';

import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/app/db/generated/prisma/client';
import { seedBenchmarks } from '@/app/db/prisma/seed/benchmarks';
import { runHardwareIndexJob } from '@/app/modules/estimation/hardware-index.job';

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv
      .slice(2)
      .filter((value, index) => value !== '--' || index > 0),
    options: {
      'dry-run': { type: 'boolean', default: false },
    },
  });

  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://run-mishe:run-mishe@localhost:55432/run-mishe';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await seedBenchmarks(prisma);
    // Keep GPU Ark weight aligned even if only benchmarks.ts ran.
    await prisma.benchmark.updateMany({
      where: { slug: 'gpuark-gpi' },
      data: {
        category: 'gpu-gaming',
        weightInIndex: 0.7,
        isActive: true,
      },
    });

    if (values['dry-run']) {
      console.log('Dry run: benchmark weights refreshed; index not written.');
      return;
    }

    const summary = await runHardwareIndexJob(prisma);
    console.log('\nHardware index job completed');
    console.log(`  calculatedAt: ${summary.calculatedAt}`);
    console.log(`  CPUs updated: ${summary.cpusUpdated}`);
    console.log(`  CPUs cleared: ${summary.cpusCleared}`);
    console.log(`  GPUs updated: ${summary.gpusUpdated}`);
    console.log(`  GPUs cleared: ${summary.gpusCleared}`);

    const topCpus = await prisma.cpu.findMany({
      where: { gamingIndex: { not: null } },
      orderBy: { gamingIndex: 'desc' },
      take: 5,
      select: { name: true, gamingIndex: true, singleThreadIndex: true },
    });
    const topGpus = await prisma.gpu.findMany({
      where: { gamingIndex: { not: null } },
      orderBy: { gamingIndex: 'desc' },
      take: 5,
      select: { name: true, gamingIndex: true },
    });
    console.log('\nTop CPUs:');
    for (const cpu of topCpus) {
      console.log(
        `  ${cpu.gamingIndex?.toFixed(2)}  ${cpu.name}  (ST ${cpu.singleThreadIndex?.toFixed(2) ?? '—'})`,
      );
    }
    console.log('\nTop GPUs:');
    for (const gpu of topGpus) {
      console.log(`  ${gpu.gamingIndex?.toFixed(2)}  ${gpu.name}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
