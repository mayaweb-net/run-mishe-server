import 'dotenv/config';

import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/app/db/generated/prisma/client';
import { runCalibrationJob } from '@/app/modules/estimation/calibration.job';

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv
      .slice(2)
      .filter((value, index) => value !== '--' || index > 0),
    options: {
      'dry-run': { type: 'boolean', default: false },
      game: { type: 'string' },
    },
  });

  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://run-mishe:run-mishe@localhost:55432/run-mishe';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const summary = await runCalibrationJob(prisma, {
      dryRun: values['dry-run'],
      gameSlug: values.game,
    });

    console.log(
      values['dry-run']
        ? '\nCalibration dry run (no writes)'
        : '\nCalibration job completed',
    );
    console.log(`  version: ${summary.calibrationVersion}`);
    console.log(`  games: ${summary.totalGames}`);
    console.log(`  calibrated: ${summary.calibrated}`);
    console.log(`  skipped: ${summary.skipped}`);
    console.log(`  rejected: ${summary.rejected}`);

    const interesting = summary.outcomes
      .filter((row) => row.status !== 'skipped' || (row.sampleCount ?? 0) > 0)
      .sort((a, b) => {
        if (a.status === b.status) {
          return (a.holdoutMape ?? 99) - (b.holdoutMape ?? 99);
        }
        if (a.status === 'calibrated') return -1;
        if (b.status === 'calibrated') return 1;
        return a.status.localeCompare(b.status);
      });

    console.log('\nResults:');
    for (const row of interesting.slice(0, 40)) {
      const mape =
        row.holdoutMape != null
          ? ` mape=${(row.holdoutMape * 100).toFixed(1)}%`
          : '';
      const cold =
        row.coldStartMape != null
          ? ` cold=${(row.coldStartMape * 100).toFixed(1)}%`
          : '';
      const r2 =
        row.rSquared != null ? ` r2=${row.rSquared.toFixed(3)}` : '';
      const reason = row.reason ? ` (${row.reason})` : '';
      console.log(
        `  [${row.status}] n=${row.sampleCount} scale=${row.scalingRows}${mape}${cold}${r2}  ${row.name}${reason}`,
      );
    }
    if (interesting.length > 40) {
      console.log(`  … ${interesting.length - 40} more`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
