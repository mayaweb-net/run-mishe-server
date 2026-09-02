/**
 * Offline check of the shipped hardware catalogue.
 *
 * Runs the same preparation the seeder does - unique slugs, unique normalized
 * names, non-conflicting aliases - without touching a database, so a bad
 * regeneration fails before anyone runs `prisma db seed`.
 *
 *   pnpm exec tsx src/app/db/prisma/seed/hardware/verify.ts
 */
import { prepareCpus } from './cpu';
import { CPU_SEED } from './cpu-data';
import { prepareGpus } from './gpu';
import { GPU_SEED } from './gpu-data';

function report(label: string, prepared: { aliases: string[] }[], expected: number): void {
  const aliases = prepared.flatMap((item) => item.aliases);
  if (prepared.length !== expected) {
    throw new Error(
      `Expected ${expected} ${label} entries, found ${prepared.length}.`,
    );
  }
  console.log(
    `${label}: ${prepared.length} entries, ${aliases.length} aliases, ` +
      `${new Set(aliases).size} distinct.`,
  );
}

const gpus = prepareGpus();
const cpus = prepareCpus();

report('GPU', gpus, GPU_SEED.length);
report('CPU', cpus, CPU_SEED.length);

const desktop = GPU_SEED.filter((gpu) => gpu.formFactor === 'DESKTOP').length;
console.log(`  GPU form factor: ${desktop} desktop, ${GPU_SEED.length - desktop} laptop`);
console.log(
  `  GPU gamingIndex range: ${Math.min(...GPU_SEED.map((g) => g.gamingIndex))}` +
    ` .. ${Math.max(...GPU_SEED.map((g) => g.gamingIndex))}`,
);

const missingBoost = CPU_SEED.filter((cpu) => cpu.boostClockMhz === null);
console.log(`  CPU without a boost clock: ${missingBoost.length}`);
console.log('Catalogue looks consistent.');
