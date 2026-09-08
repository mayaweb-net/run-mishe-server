import 'dotenv/config';

import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/app/db/generated/prisma/client';
import { runDemandTierJob } from '@/app/modules/estimation/demand-tier.job';

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
    const summary = await runDemandTierJob(prisma, {
      dryRun: values['dry-run'],
    });

    console.log(
      values['dry-run']
        ? '\nDemand tier dry run (no writes)'
        : '\nDemand tier job completed',
    );
    console.log(`  total games: ${summary.totalGames}`);
    console.log(`  updated: ${summary.updated}`);
    console.log(`  unchanged: ${summary.unchanged}`);
    console.log(
      `  skipped (no recommended GPU index): ${summary.skippedNoRecommendedGpu}`,
    );
    console.log(`  manual overrides applied: ${summary.overridden}`);
    console.log('  by tier:');
    for (const [tier, count] of Object.entries(summary.byTier)) {
      console.log(`    ${tier}: ${count}`);
    }

    const changed = summary.updates.filter((row) => row.changed).slice(0, 15);
    if (changed.length > 0) {
      console.log('\nSample changes:');
      for (const row of changed) {
        const overrideNote = row.overridden
          ? ` [override from ${row.autoTier}]`
          : '';
        console.log(
          `  ${row.previousTier} → ${row.nextTier}  idx=${row.maxRecommendedGpuIndex.toFixed(1)}  ${row.name}${overrideNote}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
